# -*- coding: utf-8 -*-
"""
视障导盲实时感知 Demo —— 网页版
浏览器打开即用，适合演示/答辩投屏：
  - 实时检测画面（视频流，模型与窗口版完全相同）
  - 页面按钮控制：暂停 / 语音开关 / 截图
  - 目标列表 + 危险红色横幅 + 语音播报（pyttsx3，服务端播）

用法（在 model-training 目录下）：
  python demo/web_demo.py                       # 摄像头 + 自动打开浏览器
  python demo/web_demo.py --source 0            # 同上
  python demo/web_demo.py --source 视频.mp4     # 播放视频文件（循环）
  python demo/web_demo.py --source 图片.jpg     # 静态图片
运行后浏览器访问 http://127.0.0.1:5000（默认自动打开）
"""
import argparse
import threading
import time
import webbrowser
from pathlib import Path

import cv2
from flask import Flask, Response, jsonify, request

from blind_demo import (DEFAULT_MODEL, OUTPUT_DIR, Analyzer, Speaker,
                        imwrite_u, render)

LEVEL_COLOR_HEX = {"危险": "#ff3b30", "近": "#ff9500", "中": "#ffcc00"}


# ================= 检测推流线程 =================
class WebDemo:
    def __init__(self, model, speaker, source):
        self.speaker = speaker
        self.analyzer = Analyzer(model, speaker)
        self.is_camera = (source == 0)
        self.is_image = False
        if self.is_camera:
            self.cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)  # Windows 下 DSHOW 打开更快
            self.mode = "摄像头"
        else:
            p = Path(source)
            if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".bmp", ".webp"):
                from blind_demo import imread_u
                self.frame0 = imread_u(p)
                self.is_image = self.frame0 is not None
                self.mode = "图片"
            else:
                from blind_demo import short_path
                self.cap = cv2.VideoCapture(short_path(p))
                self.mode = "视频"
                self.fps_in = self.cap.get(cv2.CAP_PROP_FPS) or 25  # 视频按原始帧率播放，不离线快进
        if self.is_camera:
            self.fps_in = 0
        self.paused = False
        self.fps = None
        self.jpeg = None          # 最新标注帧 (jpeg bytes)
        self.targets = []         # 最新目标列表
        self.danger = None        # 最新危险横幅文字
        self.upload = None        # 上传图片的检测结果 (jpeg, targets, danger)，优先于实时画面展示
        self.version = 0          # 帧版本号（推流去重）
        self.lock = threading.Lock()
        self.running = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _loop(self):
        if self.is_image:
            dets, danger = self.analyzer.process_frame(self.frame0)
            stable = [d for d in dets
                      if ((d["cls"], d["direction"]), d["level"]) in self.analyzer.last_confirmed]
            out = render(self.frame0, dets, danger, mode="图片", fps=None,
                         sound_on=self.speaker.enabled,
                         show_panel=False, show_banner=False, hint_text=None)
            ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if ok:
                with self.lock:
                    self.jpeg, self.targets, self.danger = buf.tobytes(), stable, danger
                    self.version += 1
            return  # 静态图处理一次即可
        while self.running:
            if self.paused:
                time.sleep(0.05)
                continue
            ok, frame = self.cap.read()
            if not ok:
                if self.is_camera:      # 摄像头偶发读取失败，稍后重试
                    time.sleep(0.05)
                    continue
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # 视频循环播放
                continue
            t_start = time.time()
            dets, danger = self.analyzer.process_frame(frame)
            dt = time.time() - t_start
            inst = 1.0 / dt if dt > 0 else 0.0
            self.fps = inst if self.fps is None else self.fps * 0.9 + inst * 0.1
            out = render(frame, dets, danger, mode=self.mode, fps=self.fps,
                         sound_on=self.speaker.enabled,
                         show_panel=False, show_banner=False, hint_text=None)
            ok2, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 82])
            if ok2:
                # 列表只显示连续2帧确认的稳定目标，避免一闪而过的检测造成列表闪烁
                stable = [d for d in dets
                          if ((d["cls"], d["direction"]), d["level"])
                          in self.analyzer.last_confirmed]
                with self.lock:
                    self.jpeg = buf.tobytes()
                    self.targets = sorted(stable, key=LEVEL_ORDER_SORT)
                    self.danger = danger
                    self.version += 1
            if not self.is_camera and self.fps_in > 1:  # 视频文件：按原始帧率播放
                time.sleep(max(0.0, 1.0 / self.fps_in - (time.time() - t_start)))

    def process_upload(self, frame):
        """处理页面上传的图片：检测一次并接管画面展示"""
        dets, danger = self.analyzer.process_frame(frame)
        dets = sorted(dets, key=LEVEL_ORDER_SORT)
        out = render(frame, dets, danger, mode="图片", fps=None,
                     sound_on=self.speaker.enabled,
                     show_panel=False, show_banner=False, hint_text=None)
        ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 88])
        if not ok:
            return False
        with self.lock:
            self.upload = (buf.tobytes(), dets, danger)
            self.version += 1
        return True

    def clear_upload(self):
        with self.lock:
            self.upload = None
            self.version += 1

    def snapshot(self):
        """返回 (jpeg_bytes, version)"""
        with self.lock:
            if self.upload is not None:
                return self.upload[0], self.version
            return self.jpeg, self.version

    def status(self):
        with self.lock:
            if self.upload is not None:
                return {
                    "mode": "图片检测",
                    "fps": None,
                    "paused": False,
                    "sound_on": self.speaker.enabled,
                    "danger": self.upload[2],
                    "uploaded": True,
                    "targets": [
                        {"name": CLASS_NAME[t["cls"]], "level": t["level"],
                         "direction": t["direction"], "conf": t["conf"]}
                        for t in self.upload[1]
                    ],
                }
            return {
                "mode": self.mode,
                "uploaded": False,
                "fps": round(self.fps, 1) if self.fps else None,
                "paused": self.paused,
                "sound_on": self.speaker.enabled,
                "danger": self.danger,
                "targets": [
                    {"name": CLASS_NAME[t["cls"]], "level": t["level"],
                     "direction": t["direction"], "conf": t["conf"]}
                    for t in self.targets
                ],
            }


def LEVEL_ORDER_SORT(det):
    return {"危险": 0, "近": 1, "中": 2}[det["level"]]


CLASS_NAME = {0: "障碍", 1: "行人", 2: "水坑", 3: "车辆"}


# ================= Flask 应用 =================
app = Flask(__name__)
demo = None  # main() 中初始化


@app.route("/")
def index():
    resp = Response(PAGE)
    resp.headers["Cache-Control"] = "no-store"  # 更新后禁止浏览器使用旧缓存页面
    return resp


@app.route("/video_feed")
def video_feed():
    def gen():
        last_ver = -1
        while True:
            jpeg, ver = demo.snapshot()
            if jpeg is None:
                time.sleep(0.05)
                continue
            if ver != last_ver:  # 有新帧才推送，避免空转
                last_ver = ver
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n")
            else:
                time.sleep(0.02)
    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/api/status")
def api_status():
    return jsonify(demo.status())


@app.route("/api/pause", methods=["POST"])
def api_pause():
    if not demo.is_image:
        demo.paused = not demo.paused
    return jsonify(ok=True, paused=demo.paused)


@app.route("/api/sound", methods=["POST"])
def api_sound():
    demo.speaker.set_enabled(not demo.speaker.enabled)
    return jsonify(ok=True, sound_on=demo.speaker.enabled)


@app.route("/api/screenshot", methods=["POST"])
def api_screenshot():
    jpeg, _ = demo.snapshot()
    if jpeg is None:
        return jsonify(ok=False)
    ts = time.strftime("%Y%m%d_%H%M%S")
    sp = OUTPUT_DIR / f"web_screenshot_{ts}.jpg"
    sp.write_bytes(jpeg)  # 已是 jpeg 字节流，直接落盘
    return jsonify(ok=True, file=sp.name)


@app.route("/api/upload", methods=["POST"])
def api_upload():
    """页面上传图片检测：不中断实时流，结果优先展示，可一键返回"""
    import numpy as np
    from blind_demo import imread_u  # noqa: F401  (保持依赖可见)
    f = request.files.get("file")
    if f is None:
        return jsonify(ok=False, msg="未收到文件")
    data = np.frombuffer(f.read(), dtype=np.uint8)
    frame = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if frame is None:
        return jsonify(ok=False, msg="图片无法解析")
    if not demo.process_upload(frame):
        return jsonify(ok=False, msg="检测失败")
    return jsonify(ok=True, name=f.filename)


@app.route("/api/back", methods=["POST"])
def api_back():
    """从图片检测结果返回实时画面"""
    demo.clear_upload()
    return jsonify(ok=True)


# ================= 页面 =================
PAGE = """<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>视障导盲障碍物实时感知系统</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html { overflow-y:scroll; }   /* 滚动条始终占位，防止内容增减时整页横向跳动 */
  body { background:#0b1220; color:#e8edf5; font-family:"Microsoft YaHei",sans-serif;
         min-height:100vh; display:flex; flex-direction:column; }
  header { padding:14px 22px; background:#111a2e; border-bottom:1px solid #1f2c47;
           display:flex; align-items:baseline; gap:14px; }
  header h1 { font-size:20px; font-weight:700; }
  header span { font-size:12px; color:#7d8ba6; }
  main { flex:1; display:flex; gap:16px; padding:16px 22px; flex-wrap:wrap; }
  .video-card { flex:1 1 640px; background:#111a2e; border:1px solid #1f2c47;
                border-radius:12px; overflow:hidden; position:relative; }
  .video-card img { width:100%; display:block; }
  .banner { position:absolute; top:14px; left:50%; transform:translateX(-50%);
            background:#e11d2e; color:#fff; font-size:20px; font-weight:700;
            padding:10px 22px; border-radius:10px; display:none;
            animation:blink 1s infinite; box-shadow:0 4px 18px rgba(225,29,46,.45); }
  @keyframes blink { 50% { background:#a30f1c; } }
  .paused-tag { position:absolute; top:14px; left:14px; background:#f59e0b; color:#111;
                font-weight:700; padding:5px 12px; border-radius:8px; display:none; }
  aside { width:320px; display:flex; flex-direction:column; gap:14px; }
  .card { background:#111a2e; border:1px solid #1f2c47; border-radius:12px; padding:14px 16px; }
  .card h2 { font-size:14px; color:#7d8ba6; font-weight:600; margin-bottom:10px; }
  .stats { display:flex; justify-content:space-between; font-size:13px; color:#c3cddf; }
  .stats b { color:#fff; font-size:16px; font-variant-numeric:tabular-nums; }  /* 数字等宽，刷新时不抖 */
  .btns { display:flex; gap:8px; margin-top:12px; }
  .btns button { flex:1; padding:9px 0; border:0; border-radius:8px; font-size:13px;
                 font-weight:600; cursor:pointer; color:#fff; transition:.15s; }
  #btnPause { background:#2453b8; } #btnSound { background:#0e8a5f; } #btnShot { background:#5b3fb8; }
  #btnUpload { background:#b8862b; } #btnBack { background:#b83a3a; display:none; }
  .btns button:hover { filter:brightness(1.2); }
  #targets { display:flex; flex-direction:column; gap:8px; height:240px;
            overflow-y:auto; padding-right:4px; }  /* 固定高度+内部滚动，条目多少都不影响外部布局 */
  .t-row { display:flex; align-items:center; gap:10px; background:#0d1526;
           border:1px solid #1f2c47; border-radius:8px; padding:8px 10px; font-size:13px;
           animation:rowin .22s ease; }
  @keyframes rowin { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
  .t-chip { color:#111; font-weight:700; font-size:12px; padding:2px 8px; border-radius:6px;
            min-width:34px; text-align:center; }
  .t-name { flex:1; font-weight:600; }
  .t-conf { color:#7d8ba6; font-size:12px; font-variant-numeric:tabular-nums; }
  .empty { color:#586a8a; font-size:13px; text-align:center; padding:14px 0; }
  .legend { font-size:12px; color:#7d8ba6; line-height:1.9; }
  .dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; }
  #toast { position:fixed; bottom:26px; left:50%; transform:translateX(-50%);
           background:#0e8a5f; color:#fff; font-size:14px; padding:9px 20px;
           border-radius:9px; opacity:0; transition:.3s; pointer-events:none; }
  #toast.show { opacity:1; }
  footer { padding:10px 22px; font-size:12px; color:#586a8a; border-top:1px solid #1f2c47; }
</style>
</head>
<body>
<header>
  <h1>视障导盲障碍物实时感知系统</h1>
  <span>基于 YOLOv8 的轻量级实时检测 Demo</span>
</header>
<main>
  <div class="video-card">
    <img src="/video_feed" alt="实时画面">
    <div id="banner" class="banner"></div>
    <div id="pausedTag" class="paused-tag">已暂停</div>
  </div>
  <aside>
    <div class="card">
      <h2>运行状态</h2>
      <div class="stats">
        <div>模式 <b id="stMode">--</b></div>
        <div>FPS <b id="stFps">--</b></div>
        <div>目标 <b id="stCnt">0</b></div>
      </div>
      <div class="btns">
        <button id="btnPause" onclick="act('/api/pause')">暂停</button>
        <button id="btnSound" onclick="act('/api/sound')">语音 开</button>
        <button id="btnShot" onclick="shot()">截图</button>
      </div>
      <div class="btns">
        <button id="btnUpload" onclick="$('fileInput').click()">上传图片检测</button>
        <button id="btnBack" onclick="backLive()">返回实时画面</button>
      </div>
      <input type="file" id="fileInput" accept="image/*" style="display:none" onchange="uploadImg(this)">
    </div>
    <div class="card">
      <h2>当前目标</h2>
      <div id="targets"><div class="empty">加载中...</div></div>
    </div>
    <div class="card">
      <h2>距离分级说明</h2>
      <div class="legend">
        <div><span class="dot" style="background:#ffcc00"></span>中（约3~5米）仅画面提示</div>
        <div><span class="dot" style="background:#ff9500"></span>近（约1.5~3米）语音提醒</div>
        <div><span class="dot" style="background:#ff3b30"></span>危险（约1米内）立即播报</div>
      </div>
    </div>
  </aside>
</main>
<footer>三江学院大学生创新创业训练计划项目 · 障碍 / 行人 / 水坑 / 车辆 四类感知 · 连续2帧确认防误报</footer>
<div id="toast"></div>
<script>
const $ = id => document.getElementById(id);
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2000); }
async function act(url){ await fetch(url,{method:'POST'}); refresh(); }
async function shot(){
  const r = await (await fetch('/api/screenshot',{method:'POST'})).json();
  if(r.ok) toast('已保存截图 ' + r.file);
}
async function uploadImg(input){
  if(!input.files || !input.files[0]) return;
  const fd = new FormData();
  fd.append('file', input.files[0]);
  toast('检测中...');
  const r = await (await fetch('/api/upload',{method:'POST', body:fd})).json();
  input.value = '';  // 允许重复选同一文件
  if(r.ok) toast('已检测 ' + r.name); else toast(r.msg || '检测失败');
  refresh();
}
async function backLive(){
  await fetch('/api/back',{method:'POST'});
  toast('已返回实时画面');
  refresh();
}
async function refresh(){
  try {
    const s = await (await fetch('/api/status')).json();
    $('stMode').textContent = s.mode;
    $('stFps').textContent = s.fps ? s.fps.toFixed(1) : (s.uploaded ? '静态' : '--');
    $('stCnt').textContent = s.targets.length;
    $('btnPause').textContent = s.paused ? '继续' : '暂停';
    $('btnSound').textContent = s.sound_on ? '语音 开' : '语音 关';
    $('pausedTag').style.display = s.paused ? 'block' : 'none';
    $('btnBack').style.display = s.uploaded ? 'block' : 'none';
    $('btnUpload').style.display = s.uploaded ? 'none' : 'block';
    const b = $('banner');
    if(s.danger){ b.textContent = s.danger; b.style.display='block'; }
    else b.style.display='none';
    const box = $('targets');
    renderTargets(box, s.targets);
  } catch(e) {}
}
// 增量更新目标行：同一目标只刷新置信度数字，不重建整行，避免列表跳动
const LEVEL_BG = {'危险':'#ff3b30','近':'#ff9500','中':'#ffcc00'};
function renderTargets(box, list){
  const old = new Map([...box.querySelectorAll('.t-row')].map(r => [r.dataset.key, r]));
  const now = new Set();
  list.forEach((t, i) => {
    const key = t.name + '|' + t.direction + '|' + t.level;
    now.add(key);
    let row = old.get(key);
    if(!row){  // 新目标：创建行
      row = document.createElement('div');
      row.className = 't-row';
      row.dataset.key = key;
      row.innerHTML =
        `<span class="t-chip" style="background:${LEVEL_BG[t.level]}">${t.level}</span>` +
        `<span class="t-name">${t.name} · ${t.direction}</span>` +
        `<span class="t-conf"></span>`;
      box.appendChild(row);
    }
    row.querySelector('.t-conf').textContent = Math.round(t.conf * 100) + '%';
    const ref = box.children[i];          // 按本次顺序归位，防止同级行上下换位
    if(ref !== row) box.insertBefore(row, ref || null);
  });
  old.forEach((row, key) => { if(!now.has(key)) row.remove(); });  // 消失的目标才删行
  if(!list.length){
    if(!box.querySelector('.empty'))
      box.innerHTML = '<div class="empty">前方无目标</div>';
  } else {
    const e = box.querySelector('.empty'); if(e) e.remove();
  }
}
setInterval(refresh, 500); refresh();
</script>
</body>
</html>"""


def main():
    ap = argparse.ArgumentParser(description="视障导盲实时感知 Demo —— 网页版")
    ap.add_argument("--source", default="0", help="0=摄像头；或图片/视频路径")
    ap.add_argument("--model", default=str(DEFAULT_MODEL))
    ap.add_argument("--conf", type=float, default=0.15)
    ap.add_argument("--port", type=int, default=5000)
    ap.add_argument("--no-sound", action="store_true", help="关闭语音")
    ap.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    args = ap.parse_args()

    import blind_demo
    blind_demo.CONF_THRES = args.conf

    # 防止重复启动：端口上已有演示在跑时，直接打开浏览器复用，避免两个实例抢端口导致页面闪烁
    import urllib.request
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{args.port}/api/status", timeout=1.5)
        print(f"检测到已有演示正在运行 (http://127.0.0.1:{args.port})")
        print("如需切换模式，请先关闭之前那个黑色窗口，再重新启动。")
        if not args.no_browser:
            webbrowser.open(f"http://127.0.0.1:{args.port}")
        return
    except Exception:
        pass  # 端口空闲，正常启动

    print("=" * 56)
    print("视障导盲障碍物实时感知 Demo（网页版）")
    print(f"模型: {args.model}")
    print(f"地址: http://127.0.0.1:{args.port}   语音: {'关' if args.no_sound else '开'}")
    print("=" * 56)

    from ultralytics import YOLO
    model = YOLO(args.model)
    speaker = Speaker(enabled=not args.no_sound)

    global demo
    src = 0 if args.source == "0" else args.source
    demo = WebDemo(model, speaker, src)

    if not args.no_browser:
        threading.Timer(1.5, lambda: webbrowser.open(f"http://127.0.0.1:{args.port}")).start()
    app.run(host="127.0.0.1", port=args.port, debug=False, threaded=True)


if __name__ == "__main__":
    main()
