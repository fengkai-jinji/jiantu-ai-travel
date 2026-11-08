# -*- coding: utf-8 -*-
"""
视障导盲障碍物实时感知 Demo（v3 模型）
功能：
  1. YOLOv8 四类检测 obstacle / person / puddle / vehicle
  2. 距离三级预警：中(约3米,仅显示) / 近(约1.5米,语音) / 危险(脚下,立即语音)
  3. 方位判断：左前方 / 正前方 / 右前方
  4. 连续 2 帧确认才报警（防抖防误报）
  5. 中文 TTS 语音播报，带冷却去重，危险提示可打断
  6. 支持 图片 / 视频文件 / 摄像头 三种输入

界面交互（视频/摄像头窗口内按键）：
  空格   暂停 / 继续
  M      语音 开 / 关
  S      保存当前画面截图
  H      显示 / 隐藏帮助
  Q/Esc  退出

用法（在 model-training 目录下）：
  python demo/blind_demo.py --source 0                    # 摄像头实时
  python demo/blind_demo.py --source 视频.mp4             # 视频文件
  python demo/blind_demo.py --source 图片.jpg             # 单张图片
  python demo/blind_demo.py --source demo/test_media --no-sound   # 批量图片(不发声,调试)
  python demo/blind_demo.py --source 0 --save             # 摄像头并保存录像
"""
import argparse
import ctypes
import queue
import sys
import threading
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


# ---------- 中文路径兼容（OpenCV 在 Windows 不支持非 ASCII 路径） ----------
def short_path(p) -> str:
    """转为 Windows 8.3 短路径，供 VideoCapture/VideoWriter 使用"""
    p = str(p)
    buf = ctypes.create_unicode_buffer(260)
    n = ctypes.windll.kernel32.GetShortPathNameW(p, buf, 260)
    return buf.value if n else p


def imread_u(p):
    """支持中文路径的 imread"""
    data = np.fromfile(str(p), dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR) if data.size else None


def imwrite_u(p, img, ext=".jpg"):
    """支持中文路径的 imwrite"""
    ok, buf = cv2.imencode(ext, img)
    if ok:
        buf.tofile(str(p))
    return ok

# ---------- 路径 ----------
ROOT = Path(__file__).resolve().parent.parent
# 模型优先用最新版，找不到则依次退回旧版（v6 -> v5 -> v4 -> v3 -> v2）
for _ver in ("multi4v6c_yolov8n", "multi4v5_yolov8n", "multi4v4_yolov8n",
             "multi4v3_yolov8n", "multi4v2_yolov8n", "multi4_yolov8n"):
    _cand = ROOT / "runs" / _ver / "weights" / "best.pt"
    if _cand.exists():
        DEFAULT_MODEL = _cand
        break
else:
    raise FileNotFoundError("找不到任何可用的多类别模型权重")
OUTPUT_DIR = ROOT / "demo" / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
WIN_TITLE = "Blind Guide Demo"

# ---------- 可调参数（校准距离时主要改这里） ----------
CONF_THRES = 0.15        # 置信度阈值：导盲宁多勿漏，用 0.15
IOU_THRES = 0.50         # NMS 阈值
NEED_FRAMES = 2          # 连续出现多少帧才确认报警
# 距离分级（依据：检测框底边在画面中的纵向位置 y2，以及框高 h；归一化 0~1，越大越近）
DANGER_Y2 = 0.88         # 底边到画面最下方 12% 以内 = 危险（约1米内）
NEAR_Y2 = 0.66           # 底边在下 1/3 = 近（约1.5~3米）
MID_Y2 = 0.48            # 底边在画面中部 = 中（约3~5米，仅画面提示不语音）
DANGER_H = 0.55          # 框特别大（占画面一半高）也算危险
NEAR_H = 0.34            # 框较大也算近
# 语音冷却秒数（同一"类别+方位+级别"多久不重复播报）
COOLDOWN_DANGER = 2.0
COOLDOWN_NEAR = 4.0

# 行进中央带过滤：车辆中心落在两侧边缘带内视为"路线外"（路边停放），
# 画面照常显示但"近"级别不语音；"危险"级别（已到脚下）始终播报
EDGE_BAND = 0.25

CLASS_CN = {0: "障碍", 1: "行人", 2: "水坑", 3: "车辆"}
LEVEL_COLOR = {"中": (0, 200, 255), "近": (0, 140, 255), "危险": (0, 0, 255)}  # BGR 黄/橙/红
LEVEL_ORDER = {"危险": 0, "近": 1, "中": 2}


def load_font(size=26):
    """加载中文字体（cv2 原生不支持中文，用 PIL 绘制）"""
    for f in [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf",
              r"C:\Windows\Fonts\simsun.ttc"]:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


_FONT_CACHE = {}


def get_font(size):
    size = int(size)
    if size not in _FONT_CACHE:
        _FONT_CACHE[size] = load_font(size)
    return _FONT_CACHE[size]


def bgr2rgb(c):
    return (c[2], c[1], c[0])


# ================= 画面绘制（PIL 半透明图层，全中文） =================
class Canvas:
    """在 OpenCV 帧上叠加半透明 UI 图层"""

    def __init__(self, frame):
        self.pil = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).convert("RGBA")
        self.W, self.H = self.pil.size
        self.overlay = Image.new("RGBA", self.pil.size, (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.overlay)

    def done(self):
        out = Image.alpha_composite(self.pil, self.overlay)
        return cv2.cvtColor(np.array(out.convert("RGB")), cv2.COLOR_RGB2BGR)


def _rrect(d, box, radius, **kw):
    try:
        d.rounded_rectangle(box, radius=radius, **kw)
    except AttributeError:  # 旧版 Pillow 无圆角
        d.rectangle(box, **kw)


def draw_box(cnv, det):
    """检测框：外圈微光 + 标签底色，全部中文"""
    x1, y1, x2, y2 = det["box"]
    rgb = bgr2rgb(LEVEL_COLOR[det["level"]])
    d = cnv.d
    d.rectangle([x1 - 3, y1 - 3, x2 + 3, y2 + 3], outline=rgb + (80,), width=7)  # 光晕
    d.rectangle([x1, y1, x2, y2], outline=rgb + (255,), width=3)
    label = f'{CLASS_CN[det["cls"]]} {det["level"]} {det["conf"]:.0%}'
    font = get_font(max(16, cnv.H // 40))
    bb = d.textbbox((0, 0), label, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    lx, ly = x1, y1 - th - 16
    if ly < 2:
        ly = y1 + 6  # 顶部放不下就放框内
    _rrect(d, [lx, ly, lx + tw + 14, ly + th + 10], 4, fill=rgb + (235,))
    d.text((lx + 7, ly + 3), label, font=font, fill=(255, 255, 255, 255))


def draw_panel(cnv, lines):
    """左上角半透明信息面板。lines: [(text, rgb, font_size), ...]"""
    d = cnv.d
    pad = 12
    widths = []
    for txt, _, size in lines:
        bb = d.textbbox((0, 0), txt, font=get_font(size))
        widths.append(bb[2] - bb[0])
    w = max(widths) + pad * 2 + 6
    h = pad * 2 + sum(size + 10 for _, _, size in lines)
    _rrect(d, [10, 10, 10 + w, 10 + h], 10, fill=(0, 0, 0, 150))
    y = 10 + pad
    for txt, color, size in lines:
        d.text((10 + pad, y), txt, font=get_font(size), fill=tuple(color) + (255,))
        y += size + 10
    return h


def draw_banner(cnv, text, y, fs):
    """顶部居中危险横幅，红色闪烁"""
    d = cnv.d
    font = get_font(fs + 6)
    bb = d.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (cnv.W - tw - 40) // 2
    blink = int(time.time() * 2) % 2 == 0
    bg = (215, 30, 30, 240) if blink else (160, 10, 10, 240)
    _rrect(d, [x, y, x + tw + 40, y + th + 22], 8, fill=bg)
    d.text((x + 20, y + 9), text, font=font, fill=(255, 255, 255, 255))


def draw_hint(cnv, text, fs):
    """底部快捷键提示条"""
    d = cnv.d
    font = get_font(fs)
    bb = d.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x, y = 14, cnv.H - th - 26
    _rrect(d, [x - 8, y - 7, x + tw + 14, y + th + 11], 6, fill=(0, 0, 0, 130))
    d.text((x, y), text, font=font, fill=(215, 215, 215, 255))


def draw_toast(cnv, text, fs):
    """底部居中临时提示（截图已保存 / 已暂停 等）"""
    d = cnv.d
    font = get_font(fs + 2)
    bb = d.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (cnv.W - tw - 36) // 2
    y = cnv.H - (th + 24) - 72
    _rrect(d, [x, y, x + tw + 36, y + th + 24], 8, fill=(0, 90, 190, 210))
    d.text((x + 18, y + 9), text, font=font, fill=(255, 255, 255, 255))


def draw_help(cnv):
    """全屏帮助层"""
    d = cnv.d
    d.rectangle([0, 0, cnv.W, cnv.H], fill=(0, 0, 0, 190))
    f_t = get_font(max(26, cnv.H // 22))
    f_i = get_font(max(18, cnv.H // 34))
    title = "操作说明"
    items = [
        ("空格", "暂停 / 继续"),
        ("M", "语音 开 / 关"),
        ("S", "保存当前画面截图"),
        ("H", "显示 / 隐藏本帮助"),
        ("Q / Esc", "退出"),
    ]
    bb = d.textbbox((0, 0), title, font=f_t)
    y = cnv.H // 2 - (len(items) + 2) * (cnv.H // 30)
    d.text(((cnv.W - (bb[2] - bb[0])) // 2, y), title, font=f_t, fill=(255, 255, 255, 255))
    y += (bb[3] - bb[1]) + 30
    for k, desc in items:
        line = f"{k}    {desc}"
        bb = d.textbbox((0, 0), line, font=f_i)
        d.text(((cnv.W - (bb[2] - bb[0])) // 2, y), line, font=f_i, fill=(225, 225, 225, 255))
        y += (bb[3] - bb[1]) + 20


def render(frame, detections, danger_text, mode="", fps=None, sound_on=True,
           show_help=False, toast=None, paused=False,
           show_panel=True, show_banner=True, hint_text="default"):
    """把一帧原始画面渲染成完整 UI 画面
    show_panel/show_banner/hint_text 供网页版复用（网页上信息由 HTML 呈现）"""
    cnv = Canvas(frame)
    fs = max(18, cnv.H // 34)      # 面板主字号
    fsmall = max(14, cnv.H // 46)  # 面板小字

    # 检测框（先画，面板压在上面）
    for det in detections:
        draw_box(cnv, det)

    # 左上信息面板
    panel_h = 0
    if show_panel:
        fps_txt = f"{fps:4.1f}" if fps else " --"
        lines = [("视障导盲实时感知系统", (255, 255, 255), fs),
                 (f"{mode}   FPS {fps_txt}   目标 {len(detections)}   语音 {'开' if sound_on else '关'}",
                  (195, 195, 195), fsmall)]
        if paused:
            lines.append(("已暂停（空格继续）", (255, 170, 60), fsmall))
        if detections:
            for det in sorted(detections, key=lambda t: LEVEL_ORDER[t["level"]]):
                txt = f'{det["level"]}   {CLASS_CN[det["cls"]]}·{det["direction"]}   {det["conf"]:.0%}'
                lines.append((txt, bgr2rgb(LEVEL_COLOR[det["level"]]), fsmall))
        else:
            lines.append(("前方无目标", (165, 165, 165), fsmall))
        panel_h = draw_panel(cnv, lines)

    # 危险横幅（面板下方居中）
    if danger_text and show_banner:
        draw_banner(cnv, danger_text, 10 + panel_h + 14, fs)

    # 底部快捷键提示（hint_text=None 跳过，供网页版复用）
    if hint_text is not None:
        if hint_text == "default":
            hint = "S 截图 | 任意键关闭" if mode == "图片" else \
                   "空格 暂停 | M 语音 | S 截图 | H 帮助 | Q 退出"
        else:
            hint = hint_text
        draw_hint(cnv, hint, fsmall)

    if show_help:
        draw_help(cnv)
    if toast:
        text, until = toast
        if time.time() < until:
            draw_toast(cnv, text, fsmall)
    return cnv.done()


def save_screenshot(img):
    ts = time.strftime("%Y%m%d_%H%M%S")
    sp = OUTPUT_DIR / f"screenshot_{ts}.jpg"
    imwrite_u(sp, img)
    return sp


# ================= 语音播报器 =================
class Speaker:
    def __init__(self, enabled=True):
        self.enabled = enabled
        self.q = queue.Queue()
        self._last_spoken = {}   # (cls,dir,level) -> 上次播报时间
        self.engine = None
        if enabled:
            threading.Thread(target=self._loop, daemon=True).start()

    def _make_engine(self):
        """在播报线程内创建引擎（pyttsx3 引擎必须与 runAndWait 同线程，否则会静默无声）"""
        import pyttsx3
        engine = pyttsx3.init()
        voices = engine.getProperty("voices")
        for v in voices:  # 优先选中文女声
            if "chinese" in v.name.lower() or "huihui" in v.name.lower() or "yaoyao" in v.name.lower():
                engine.setProperty("voice", v.id)
                break
        engine.setProperty("rate", 175)   # 语速
        engine.setProperty("volume", 1.0)
        self.engine = engine
        return engine

    def _loop(self):
        engine = self._make_engine()
        while True:
            text = self.q.get()
            try:
                engine.say(text)
                engine.runAndWait()
            except Exception:
                engine = self._make_engine()  # 引擎异常则重建后继续

    def set_enabled(self, on):
        """M 键切换：关语音时清空待播队列"""
        self.enabled = on
        if not on:
            try:
                self.engine.stop()
            except Exception:
                pass
            while not self.q.empty():
                try:
                    self.q.get_nowait()
                except queue.Empty:
                    break

    def say(self, cls_id, direction, level):
        """按冷却规则决定是否播报；danger 可打断当前语音"""
        now = time.time()
        key = (cls_id, direction, level)
        cd = COOLDOWN_DANGER if level == "危险" else COOLDOWN_NEAR
        if now - self._last_spoken.get(key, 0) < cd:
            return
        self._last_spoken[key] = now

        name = CLASS_CN[cls_id]
        if cls_id == 2:  # 水坑固定话术
            text = "小心脚下，水坑"
        elif level == "危险":
            text = f"危险！{direction}有{name}，请停下"
        else:            # 近
            text = f"{direction}有{name}"

        if not self.enabled:
            print(f"[语音-关] {text}")
            return
        if level == "危险":  # 危险提示插队并打断
            try:
                self.engine.stop()
            except Exception:
                pass
            while not self.q.empty():
                try:
                    self.q.get_nowait()
                except queue.Empty:
                    break
        self.q.put(text)


# ================= 单帧分析 =================
class Analyzer:
    def __init__(self, model, speaker, need_frames=NEED_FRAMES):
        self.model = model
        self.speaker = speaker
        self.need_frames = need_frames
        self.tracks = {}   # (cls,dir) -> 连续命中帧数
        self.last_confirmed = set()  # 最近一帧已通过多帧确认的 ((cls,dir), level)

    def judge(self, x1, y1, x2, y2, cls_id):
        """根据框的位置/大小返回 (级别, 方位)，级别 None 表示太远忽略"""
        h = y2 - y1
        cx = (x1 + x2) / 2
        if cx < 0.33:
            direction = "左前方"
        elif cx > 0.67:
            direction = "右前方"
        else:
            direction = "正前方"

        if y2 >= DANGER_Y2 or h >= DANGER_H:
            level = "危险"
        elif y2 >= NEAR_Y2 or h >= NEAR_H:
            level = "近"
        elif y2 >= MID_Y2:
            level = "中"
        else:
            level = None
        # 水坑在路面上，进入画面中部(约3~5米)就值得提醒，按"近"处理
        if cls_id == 2 and level in (None, "中") and y2 >= 0.42:
            level = "近"
        return level, direction

    def process_frame(self, frame):
        """返回 (detections, danger_text)；detections 供渲染，danger_text 供横幅"""
        results = self.model(frame, conf=CONF_THRES, iou=IOU_THRES, verbose=False)[0]
        H, W = frame.shape[:2]
        hits = set()
        detections = []

        if results.boxes is not None:
            for b in results.boxes:
                x1, y1, x2, y2 = b.xyxy[0].tolist()
                x1, y1, x2, y2 = x1 / W, y1 / H, x2 / W, y2 / H
                cls_id = int(b.cls[0])
                conf = float(b.conf[0])
                level, direction = self.judge(x1, y1, x2, y2, cls_id)
                if level is None:
                    continue  # 太远，忽略不画不报

                # 路线外车辆（路边停放）：保留画面提示，语音按规则抑制
                cx = (x1 + x2) / 2
                off_route = (cls_id == 3 and
                             (cx < EDGE_BAND or cx > 1.0 - EDGE_BAND))
                key = (cls_id, direction)
                hits.add((key, level, off_route))
                detections.append({
                    "box": (int(x1 * W), int(y1 * H), int(x2 * W), int(y2 * H)),
                    "cls": cls_id, "conf": conf,
                    "level": level, "direction": direction,
                })

        # 多帧确认 + 语音
        confirmed = set()
        for key, level, off_route in hits:
            self.tracks[key] = self.tracks.get(key, 0) + 1
            if self.tracks[key] >= self.need_frames:
                confirmed.add((key, level, off_route))
        self.last_confirmed = confirmed
        for k in list(self.tracks.keys()):
            if not any(k == key for key, _, _ in hits):
                del self.tracks[k]

        # 危险优先播报，其余按级别排；路线外车辆"近"不语音
        for (key, level, off_route) in sorted(confirmed, key=lambda t: LEVEL_ORDER[t[1]]):
            cls_id, direction = key
            if off_route and level != "危险":
                continue
            if level in ("危险", "近"):   # "中"只在画面提示，不说话
                self.speaker.say(cls_id, direction, level)

        # 危险横幅文字（本帧仍在画面的最高级别危险目标）
        danger_text = None
        dlist = [(k[1], k[0]) for k, lv, _ in confirmed if lv == "危险"]
        if dlist:
            direction, cls_id = dlist[0]
            danger_text = "危险！小心脚下，水坑" if cls_id == 2 else \
                          f"危险！{direction}有{CLASS_CN[cls_id]}，请停下"
            if len(dlist) > 1:
                danger_text += f" 等{len(dlist)}处"
        return detections, danger_text


# ================= 输入处理 =================
def run_image(model, speaker, path, save=True, show=True):
    analyzer = Analyzer(model, speaker, need_frames=1)  # 单张图不做多帧确认
    img = imread_u(path)
    if img is None:
        print(f"无法读取图片: {path}")
        return
    dets, danger = analyzer.process_frame(img)
    out = render(img, dets, danger, mode="图片", sound_on=speaker.enabled)
    if save:
        sp = OUTPUT_DIR / f"result_{Path(path).stem}.jpg"
        imwrite_u(sp, out)
        print(f"已保存: {sp}")
    if show:
        while True:
            cv2.imshow(WIN_TITLE, out)
            k = cv2.waitKey(0) & 0xFF
            if k in (27, ord("q")):
                break
            if k in (ord("s"), ord("S")):
                sp = save_screenshot(out)
                print(f"已保存截图: {sp}")
                out = render(img, dets, danger, mode="图片", sound_on=speaker.enabled,
                             toast=(f"已保存截图 {sp.name}", time.time() + 2))
                continue
            break
        cv2.destroyAllWindows()


def run_video(model, speaker, source, save=False, show=True):
    analyzer = Analyzer(model, speaker)
    cap_src = 0 if source == 0 else short_path(source)  # 中文路径转短路径
    cap = cv2.VideoCapture(cap_src)
    if not cap.isOpened():
        print(f"无法打开视频源: {source}")
        return
    mode = "摄像头" if source == 0 else "视频"
    fps_in = cap.get(cv2.CAP_PROP_FPS)

    writer = None
    paused = False
    help_on = False
    toast = None
    fps_est = None
    last = None      # (frame, dets, danger)
    out_img = None

    def make_out():
        return render(last[0], last[1], last[2], mode=mode, fps=fps_est,
                      sound_on=speaker.enabled, show_help=help_on,
                      toast=toast, paused=paused)

    while True:
        if not paused:
            ok, frame = cap.read()
            if not ok:
                break
            t0 = time.time()
            dets, danger = analyzer.process_frame(frame)
            dt = time.time() - t0
            inst = 1.0 / dt if dt > 0 else 0.0
            fps_est = inst if fps_est is None else fps_est * 0.9 + inst * 0.1
            last = (frame, dets, danger)
            out_img = make_out()
            if save:
                if writer is None:
                    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                    out_mp4 = short_path(OUTPUT_DIR / "demo_result.mp4")
                    writer = cv2.VideoWriter(out_mp4, fourcc,
                                             fps_in if fps_in and fps_in > 1 else 20.0,
                                             (out_img.shape[1], out_img.shape[0]))
                writer.write(out_img)

        if not show:
            continue
        if paused:  # 暂停时保持重绘，让 toast 到期消失、帮助层即时刷新
            out_img = make_out()
        cv2.imshow(WIN_TITLE, out_img)
        key = cv2.waitKey(30 if paused else 1) & 0xFF
        if key in (27, ord("q")):
            break
        elif key == ord(" "):
            paused = not paused
            toast = ("已暂停，按空格继续" if paused else "继续", time.time() + 2)
        elif key in (ord("m"), ord("M")):
            speaker.set_enabled(not speaker.enabled)
            toast = (f"语音已{'开启' if speaker.enabled else '关闭'}", time.time() + 2)
        elif key in (ord("s"), ord("S")):
            sp = save_screenshot(out_img)
            print(f"已保存截图: {sp}")
            toast = (f"已保存截图 {sp.name}", time.time() + 2.5)
        elif key in (ord("h"), ord("H")):
            help_on = not help_on
        else:
            continue
        out_img = make_out()  # 状态变化后立即重绘当前帧

    cap.release()
    if writer:
        writer.release()
        print(f"已保存: {OUTPUT_DIR / 'demo_result.mp4'}")
    if show:
        cv2.destroyAllWindows()


def main():
    global CONF_THRES
    ap = argparse.ArgumentParser(description="视障导盲实时感知 Demo")
    ap.add_argument("--source", default="0",
                    help="0=摄像头；或图片/视频路径；或图片文件夹")
    ap.add_argument("--model", default=str(DEFAULT_MODEL))
    ap.add_argument("--conf", type=float, default=CONF_THRES)
    ap.add_argument("--no-sound", action="store_true", help="关闭语音（只在画面显示）")
    ap.add_argument("--no-window", action="store_true", help="不弹窗（批量处理/后台运行）")
    ap.add_argument("--save", action="store_true", help="保存结果图片/视频")
    args = ap.parse_args()
    show_win = not args.no_window
    CONF_THRES = args.conf

    print("=" * 56)
    print("视障导盲障碍物实时感知 Demo")
    print(f"模型: {args.model}")
    print(f"置信度阈值: {CONF_THRES}  语音: {'关' if args.no_sound else '开'}")
    if show_win:
        print("窗口快捷键: 空格=暂停  M=语音开关  S=截图  H=帮助  Q=退出")
    print("=" * 56)

    from ultralytics import YOLO
    model = YOLO(args.model)
    speaker = Speaker(enabled=not args.no_sound)

    src = args.source
    if src == "0":
        run_video(model, speaker, 0, save=args.save, show=show_win)
    else:
        p = Path(src)
        if p.is_dir():
            imgs = sorted([f for f in p.glob("*.*")
                           if f.suffix.lower() in (".jpg", ".jpeg", ".png")])
            for f in imgs:
                run_image(model, speaker, f, save=True, show=show_win)
        elif p.suffix.lower() in (".jpg", ".jpeg", ".png", ".bmp", ".webp"):
            run_image(model, speaker, p, save=True, show=show_win)
        else:
            run_video(model, speaker, str(p), save=args.save, show=show_win)


if __name__ == "__main__":
    main()
