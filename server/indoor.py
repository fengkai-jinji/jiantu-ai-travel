"""Indoor object-finding service (port 8765).

Serves the indoor YOLOv8 model (3 classes: bottle/chair/door) with the same
JSON contract the front end already consumes via /api/image:

  {objects:[{class_id,name,label,confidence,xyxy,side}], image, width, height,
   inference_ms, device}

Weights live in model-training/indoor/, default products_v3 (train set 5055
images), products_v2 kept as fallback and selected with ?mode=v2. Both builds
share the same three class names, so the front end needs no change.

Only single-frame photos are served here. Video / camera streams stay in the
standalone demo under 数据集与标注/YOLOv8/web_demo, which this service must not
depend on: the repo has to run from a fresh clone.
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
PORT = 8765
WEIGHTS = ROOT / 'model-training' / 'indoor'
MODELS = {'project': WEIGHTS / 'products_v3' / 'weights' / 'best.pt',
          'v2': WEIGHTS / 'products_v2' / 'weights' / 'best.pt'}
LABELS = {'bottle': '瓶／杯', 'chair': '椅子', 'door': '门'}


def route(path):
    """vite 的 /api 代理不重写路径，前端请求 /api/image 到端口上原样还是 /api/image；
    同时接受不带前缀的写法，方便用 curl 或别的代理直接打。"""
    return path[4:] if path.startswith('/api/') else path



def settings(values):
    conf = float(values.get('conf', .35))
    mode = values.get('mode', 'project')
    if not math.isfinite(conf) or not .05 <= conf <= .95:
        raise ValueError('置信度必须在 0.05～0.95 之间。')
    if mode not in MODELS:
        raise ValueError('未知模型：' + str(mode))
    return conf, mode


class Detector:
    """懒加载：只有真正用到的版本才占显存，回退到 v2 不必重启服务。"""

    def __init__(self):
        os.environ.setdefault('YOLO_CONFIG_DIR', str(ROOT / '.ultralytics'))
        import torch
        torch.set_num_threads(4)
        self.device = 0 if torch.cuda.is_available() else 'cpu'
        self.device_name = torch.cuda.get_device_name(0) if self.device == 0 else 'CPU'
        self.models = {}
        self.lock = threading.Lock()

    def model(self, mode):
        from ultralytics import YOLO
        if mode not in self.models:
            path = MODELS[mode]
            if not path.is_file():
                raise ValueError('模型权重不存在：' + str(path))
            self.models[mode] = YOLO(str(path))
        return self.models[mode]

    def info(self):
        return {'device': self.device_name,
                'models': {mode: {'path': str(path), 'present': path.is_file()}
                           for mode, path in MODELS.items()}}

    def predict(self, frame, conf, mode):
        with self.lock:
            model = self.model(mode)
            began = time.perf_counter()
            result = model.predict(frame, conf=conf, imgsz=640,
                                   device=self.device, verbose=False)[0]
            elapsed = (time.perf_counter() - began) * 1000
            width = frame.shape[1]
            objects = []
            for box in result.boxes or []:
                class_id = int(box.cls.item())
                name = str(model.names.get(class_id, class_id))
                xy = [round(float(v), 1) for v in box.xyxy[0].tolist()]
                center = (xy[0] + xy[2]) / (2 * width)
                objects.append({
                    'class_id': class_id, 'name': name,
                    'label': LABELS.get(name, name),
                    'confidence': round(float(box.conf.item()), 4),
                    'xyxy': xy,
                    'side': '左侧' if center < 1 / 3 else '右侧' if center > 2 / 3 else '中间',
                })
            # 置信度降序：前端「当前目标」直接取首个即最可信的一个
            objects.sort(key=lambda o: -o['confidence'])
            return {'objects': objects, 'inference_ms': round(elapsed, 1),
                    'device': self.device_name}


def frame_result(detector, frame, conf, mode):
    height, width = frame.shape[:2]
    if max(height, width) > 1280:
        scale = 1280 / max(height, width)
        frame = cv2.resize(frame, (round(width * scale), round(height * scale)))
    result = detector.predict(frame, conf, mode)
    ok, encoded = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        raise ValueError('图像编码失败。')
    return result | {'image': 'data:image/jpeg;base64,' + base64.b64encode(encoded).decode(),
                     'width': frame.shape[1], 'height': frame.shape[0],
                     'warning': None}  # 沿用旧服务的键，前端不作判断也能读


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # 摄像头采样会持续发帧，不刷日志

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
            if route(url.path) == '/status':
                self.json_response(self.server.state.info())
            else:
                self.json_response({'error': '接口不存在。'}, 404)
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
            if route(url.path) != '/image':
                self.json_response({'error': '接口不存在。'}, 404)
                return
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0:
                self.json_response({'error': '请求体为空，请上传图片。'}, 400)
                return
            if size > 12 * 1024 * 1024:
                self.json_response({'error': '图片过大：最多 12 MB。'}, 413)
                return
            # 先读完请求体再校验参数：否则 400 时正文留在缓冲里，客户端读响应会收到连接重置
            raw = self.rfile.read(size)
            conf, mode = settings(query)
            frame = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR) if raw else None
            if frame is None:
                raise ValueError('图片无法读取，请选择 JPG、PNG 或 WebP。')
            self.json_response(frame_result(self.server.state, frame, conf, mode))
        except (ValueError, TypeError, KeyError) as error:
            self.json_response({'error': str(error)}, 400)
        except (ConnectionError, BrokenPipeError):
            pass
        except Exception as error:
            print('Inference error:', repr(error), flush=True)
            self.json_response({'error': '处理失败：' + str(error)}, 500)


def make_server(host='127.0.0.1', port=PORT, detector=None):
    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    server.state = detector or Detector()
    return server


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=PORT)
    args = parser.parse_args()
    server = make_server(port=args.port)
    print(f'Indoor YOLO ready: http://127.0.0.1:{server.server_port}', flush=True)
    print('Model:', MODELS['project'], 'Device:', server.state.info()['device'], flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
