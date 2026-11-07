"""Local Amap adapter. Keys stay on the server; request bodies are not logged."""
import json
import math
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def settings():
    values = {}
    path = ROOT / '.env'
    if path.exists():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                values[key.strip()] = value.strip().strip('\"').strip("'")
    for name in ['AMAP_MAPS_API_KEY', 'LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL']:
        if os.environ.get(name):
            values[name] = os.environ[name]
    return values


def api_key():
    key = settings().get('AMAP_MAPS_API_KEY')
    if not key:
        raise ValueError('请在本地 .env 中配置 AMAP_MAPS_API_KEY。')
    return key


def amap(path, params, timeout=20):
    url = 'https://restapi.amap.com/v3/' + path + '?' + urlencode({**params, 'key': api_key()})
    try:
        with urlopen(url, timeout=timeout) as response:
            data = json.load(response)
    except Exception:
        raise ValueError('高德服务连接失败，请检查网络后重试。') from None
    if data.get('status') != '1':
        code = str(data.get('infocode', 'UNKNOWN'))
        raise ValueError('高德查询失败，错误码：' + code[:20] + '。请检查 Key 权限及配额。')
    return data


def text(value, label, maximum=80):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError('请填写有效的' + label + '。')
    return value.strip()


def coordinate(value):
    try:
        parts = value.split(',')
        if len(parts) != 2:
            raise ValueError()
        x, y = map(float, parts)
        if not (math.isfinite(x) and math.isfinite(y) and -180 <= x <= 180 and -90 <= y <= 90):
            raise ValueError()
        return f'{x},{y}'
    except (AttributeError, TypeError, ValueError):
        raise ValueError('地点坐标无效，请重新搜索并选择地点。') from None


def places(body, timeout=20):
    data = amap('place/text', {'keywords': text(body.get('keywords'), '地点'),
                'city': text(body.get('city'), '城市', 40), 'citylimit': 'true', 'offset': 8, 'extensions': 'base'}, timeout=timeout)
    return {'places': [{'id': p['id'], 'name': p['name'],
                       'address': p.get('address') if isinstance(p.get('address'), str) else '',
                       'location': p['location']} for p in data.get('pois', []) if p.get('location')]}


def nearby(body, timeout=12):
    location = coordinate(body.get('location'))
    keywords = body.get('keywords', '')
    if not isinstance(keywords, str) or len(keywords) > 40:
        raise ValueError('周边搜索关键词无效。')
    data = amap('place/around', {'location': location, 'keywords': keywords.strip(), 'types': '050000',
                'radius': 2000, 'sortrule': 'distance', 'offset': 5, 'page': 1, 'extensions': 'base'}, timeout=timeout)
    found = []
    for poi in (data.get('pois') or [])[:5]:
        if not isinstance(poi, dict) or not isinstance(poi.get('name'), str) or not poi['name'].strip():
            continue
        try:
            position = coordinate(poi.get('location'))
        except ValueError:
            continue
        try:
            distance = float(poi.get('distance'))
            distance = int(distance) if math.isfinite(distance) and 0 <= distance <= 50000 else None
        except (TypeError, ValueError):
            distance = None
        found.append({'id': str(poi.get('id') or position), 'name': poi['name'], 'location': position,
                      'address': poi.get('address') if isinstance(poi.get('address'), str) else '',
                      'distance': distance, 'type': poi.get('type') if isinstance(poi.get('type'), str) else ''})
    return {'places': found, 'radius': 2000, 'source': '高德地图 Web 服务 · 周边搜索',
            'queriedAt': datetime.now(timezone.utc).isoformat()}


def walking(body):
    origin, destination = coordinate(body.get('origin')), coordinate(body.get('destination'))
    if origin == destination:
        raise ValueError('起点和终点相同，请重新选择。')
    data = amap('direction/walking', {'origin': origin, 'destination': destination})
    paths = data.get('route', {}).get('paths') or []
    if not paths:
        raise ValueError('高德未返回步行路线，请调整地点或在高德地图确认。')
    return {'routes': [{'distance': int(p.get('distance') or 0), 'duration': int(p.get('duration') or 0),
                        'steps': [s.get('instruction', '') for s in p.get('steps', []) if s.get('instruction')]}
                       for p in paths[:3]],
            'source': '高德地图 Web 服务 · 步行路径规划',
            'queriedAt': datetime.now(timezone.utc).isoformat(),
            'notice': '普通步行路线，未核实台阶、电梯、盲道或临时障碍；耗时为估算，不是所选出发时刻的预测。'}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, status, payload):
        raw = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        try:
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if self.path == '/trip-api/status':
            from agent import llm_ready
            from kb import load_kb
            try:
                api_key()
                configured = {'configured': True, 'agentConfigured': llm_ready()}
            except ValueError:
                configured = {'configured': False, 'agentConfigured': llm_ready()}
            try:
                topics, entries = load_kb()
                configured.update({'kbConfigured': True, 'kbTopics': topics, 'kbCount': len(entries)})
            except Exception:
                configured.update({'kbConfigured': False, 'kbTopics': [], 'kbCount': 0})
            self.reply(200, configured)
        else:
            self.reply(404, {'error': '接口不存在。'})

    def do_POST(self):
        if self.headers.get('Host') != '127.0.0.1:8766' or self.headers.get('Origin') not in (None, 'http://127.0.0.1:8766'):
            self.reply(403, {'error': '请求来源无效。'})
            return
        from routes import compare
        from agent import chat
        from kb import ask as kb_ask
        limit = 32000 if self.path in ('/trip-api/chat', '/trip-api/kb') else 4096
        handler = {'/trip-api/places': places, '/trip-api/walking': walking,
                   '/trip-api/compare': compare, '/trip-api/chat': chat,
                   '/trip-api/kb': kb_ask}.get(self.path)
        if not handler:
            self.reply(404, {'error': '接口不存在。'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= limit:
                raise ValueError('请求内容过长或为空。')
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError('请求格式无效。')
            self.reply(200, handler(body))
        except (ValueError, UnicodeDecodeError) as error:
            self.reply(400, {'error': str(error) if not isinstance(error, json.JSONDecodeError) else '请求格式无效。'})
        except Exception:
            self.reply(502, {'error': '地图服务暂时不可用，请稍后重试。'})


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 8766), Handler)
    print('Jiantu maps ready: http://127.0.0.1:8766', flush=True)
    server.serve_forever()
