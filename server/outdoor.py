"""Outdoor obstacle perception service (port 8767).

Serves the portable inference package model (multi4v6c_yolov8n, 4 classes:
obstacle/person/puddle/vehicle) with the same JSON contract as the indoor
YOLO demo (/api/image on 8765), extended with level/direction fields that
follow the original blind_demo calibration:

  level    危险(约1米内) / 近(约1.5~3米) / 中(约3~5米) / None(太远忽略)
  direction 左前方 / 正前方 / 右前方
"""
import base64
import json
import math
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / '便携推理包' / 'runs' / 'multi4v6c_yolov8n' / 'weights' / 'best.pt'
PORT = 8767

LABELS = {'obstacle': '障碍', 'person': '行人', 'puddle': '水坑', 'vehicle': '车辆'}
# 与 demo/blind_demo.py 完全一致的标定参数
DANGER_Y2, NEAR_Y2, MID_Y2 = 0.88, 0.66, 0.48
DANGER_H, NEAR_H = 0.55, 0.34
EDGE_BAND = 0.25          # 车辆中心落在两侧边缘带 = 路线外（路边停放）
PUDDLE_NEAR_Y2 = 0.42     # 水坑进入画面中部即按“近”处理


def settings(values):
    conf = float(values.get('conf', .15))
    if not math.isfinite(conf) or not .05 <= conf <= .95:
        raise ValueError('置信度必须在 0.05～0.95 之间。')
    return conf


def judge(x1, y1, x2, y2, class_id):
    """归一化框 → (级别, 方位)；级别 None 表示太远忽略（与 blind_demo.judge 一致）"""
    h = y2 - y1
    cx = (x1 + x2) / 2
    direction = '左前方' if cx < 1 / 3 else '右前方' if cx > 2 / 3 else '正前方'
    if y2 >= DANGER_Y2 or h >= DANGER_H:
        level = '危险'
    elif y2 >= NEAR_Y2 or h >= NEAR_H:
        level = '近'
    elif y2 >= MID_Y2:
        level = '中'
    else:
        level = None
    if class_id == 2 and level in (None, '中') and y2 >= PUDDLE_NEAR_Y2:
        level = '近'
    return level, direction


class Detector:
    def __init__(self):
        os.environ.setdefault('YOLO_CONFIG_DIR', str(ROOT / '.ultralytics'))
        import torch
        torch.set_num_threads(4)
        self.device = 0 if torch.cuda.is_available() else 'cpu'
        self.device_name = torch.cuda.get_device_name(0) if self.device == 0 else 'CPU'
        if not MODEL_PATH.is_file():
            raise FileNotFoundError('模型权重不存在：' + str(MODEL_PATH))
        from ultralytics import YOLO
        self.model = YOLO(str(MODEL_PATH))
        self.names = self.model.names
        self.lock = threading.Lock()

    def info(self):
        return {'device': self.device_name, 'model': str(MODEL_PATH),
                'classes': {str(k): LABELS.get(v, v) for k, v in self.names.items()}}

    def predict(self, frame, conf):
        with self.lock:
            began = time.perf_counter()
            result = self.model.predict(frame, conf=conf, iou=0.50, imgsz=640,
                                        device=self.device, verbose=False)[0]
            elapsed = (time.perf_counter() - began) * 1000
            height, width = frame.shape[:2]
            objects = []
            for box in result.boxes or []:
                class_id = int(box.cls.item())
                name = str(self.names.get(class_id, class_id))
                xy = [round(float(v), 1) for v in box.xyxy[0].tolist()]
                nx1, ny1, nx2, ny2 = (xy[0] / width, xy[1] / height,
                                      xy[2] / width, xy[3] / height)
                level, direction = judge(nx1, ny1, nx2, ny2, class_id)
                if level is None:
                    continue  # 太远，忽略不画不报（与原演示一致）
                cx = (nx1 + nx2) / 2
                objects.append({
                    'class_id': class_id, 'name': name,
                    'label': LABELS.get(name, name),
                    'confidence': round(float(box.conf.item()), 4),
                    'xyxy': xy, 'level': level, 'direction': direction,
                    'off_route': class_id == 3 and (cx < EDGE_BAND or cx > 1 - EDGE_BAND),
                    'side': '左侧' if cx < 1 / 3 else '右侧' if cx > 2 / 3 else '中间',
                })
            objects.sort(key=lambda o: {'危险': 0, '近': 1, '中': 2}[o['level']])
            return {'objects': objects, 'inference_ms': round(elapsed, 1),
                    'device': self.device_name}


def frame_result(detector, frame, conf):
    height, width = frame.shape[:2]
    if max(height, width) > 1280:
        scale = 1280 / max(height, width)
        frame = cv2.resize(frame, (round(width * scale), round(height * scale)))
    result = detector.predict(frame, conf)
    ok, encoded = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        raise ValueError('图像编码失败。')
    return result | {'image': 'data:image/jpeg;base64,' + base64.b64encode(encoded).decode(),
                     'width': frame.shape[1], 'height': frame.shape[0]}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # 本地服务不刷日志，避免采样帧刷屏

    def json_response(self, value, status=200):
        raw = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        url = urlsplit(self.path)
        try:
            if url.path == '/status':
                self.json_response(self.server.state.info())
            else:
                self.json_response({'error': '页面不存在。'}, 404)
        except (ConnectionError, BrokenPipeError):
            pass

    def do_POST(self):
        url = urlsplit(self.path)
        query = {k: v[0] for k, v in parse_qs(url.query).items()}
        try:
            origin = self.headers.get('Origin')
            if origin and urlsplit(origin).netloc != self.headers.get('Host'):
                self.json_response({'error': '只允许本地页面发起请求。'}, 403)
                return
            if url.path != '/image':
                self.json_response({'error': '接口不存在。'}, 404)
                return
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > 12 * 1024 * 1024:
                self.json_response({'error': '图片过大：最多 12 MB。'}, 413)
                return
            raw = self.rfile.read(size)
            frame = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR) if raw else None
            if frame is None:
                raise ValueError('图片无法读取，请选择 JPG、PNG 或 WebP。')
            self.json_response(frame_result(self.server.state, frame, settings(query)))
        except ValueError as error:
            self.json_response({'error': str(error)}, 400)
        except (ConnectionError, BrokenPipeError):
            pass
        except Exception as error:
            print('Inference error:', repr(error), flush=True)
            self.json_response({'error': '处理失败：' + str(error)}, 500)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    server.daemon_threads = True
    server.state = Detector()
    print(f'Outdoor YOLO ready: http://127.0.0.1:{PORT}', flush=True)
    print('Model:', MODEL_PATH, 'Device:', server.state.info()['device'], flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
