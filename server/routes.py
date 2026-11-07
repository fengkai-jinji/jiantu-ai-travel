from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from maps import amap, coordinate, text, walking

STRATEGIES = {'少换乘': '2', '减少步行': '3', '优先地铁': '0'}


def number(value):
    try:
        result = float(value)
        return int(result) if 0 <= result < 100000000 else None
    except (ValueError, TypeError):
        return None


def line_kind(line):
    """Amap marks metro lines in the type field; older payloads only have names."""
    if '地铁' in (line.get('type') or '') or (line.get('name') or '').startswith('地铁'):
        return '地铁'
    return '公交'


def populated(value):
    """True only when a segment block carries real data, not Amap's empty placeholder objects."""
    if isinstance(value, dict):
        return any(bool(item) for item in value.values())
    return bool(value)


def departure_params(value):
    if not value:
        return {}
    try:
        dt = datetime.strptime(value, '%Y-%m-%dT%H:%M').replace(tzinfo=timezone(timedelta(hours=8)))
        if dt <= datetime.now(timezone.utc):
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError('请选择未来的具体出发时间（北京时间），或选择尽快出发。') from None
    return {'date': dt.strftime('%Y-%m-%d'), 'time': dt.strftime('%H:%M')}


def transit(params, strategy):
    data = amap('direction/transit/integrated', {**params, 'strategy': strategy, 'extensions': 'all'}, timeout=25)
    result = []
    for path in (data.get('route', {}).get('transits') or [])[:4]:
        steps, lines, legs, bus_distance, supported = [], [], [], 0, True
        for segment in path.get('segments', []):
            walk = segment.get('walking') or {}
            steps.extend(s['instruction'] for s in walk.get('steps', []) if s.get('instruction'))
            buses = (segment.get('bus') or {}).get('buslines') or []
            if buses:
                bus = buses[0]  # alternative lines within a segment are not transfers
                kind = line_kind(bus)
                lines.append(bus.get('name', '公交'))
                start = (bus.get('departure_stop') or {}).get('name', '起乘站')
                end = (bus.get('arrival_stop') or {}).get('name', '下车站')
                legs.append({'kind': kind, 'name': bus.get('name', ''), 'from': start, 'to': end})
                steps.append(f"从{start}乘坐{lines[-1]}，在{end}下车。")
                distance = number(bus.get('distance'))
                bus_distance = None if bus_distance is None or distance is None else bus_distance + distance
            if populated(segment.get('railway')) or populated(segment.get('taxi')):
                supported = False
        if not supported or not lines:
            continue
        kinds = {leg['kind'] for leg in legs}
        mode = '公交＋地铁' if kinds == {'公交', '地铁'} else '地铁' if kinds == {'地铁'} else '公交'
        walk_distance = number(path.get('walking_distance'))
        result.append({'mode': mode, 'distance': None if walk_distance is None or bus_distance is None else walk_distance + bus_distance,
                       'walkingDistance': walk_distance, 'duration': number(path.get('duration')),
                       'transfers': max(0, len(lines) - 1), 'steps': steps, 'lines': lines, 'legs': legs})
    return result


def compare(body):
    origin, destination = coordinate(body.get('origin')), coordinate(body.get('destination'))
    if origin == destination:
        raise ValueError('起点和终点相同，请重新选择。')
    city = text(body.get('city'), '城市', 40)
    preferences = body.get('preferences', [])
    if not isinstance(preferences, list) or any(p not in [*STRATEGIES, '关注台阶与电梯'] for p in preferences):
        raise ValueError('出行偏好无效。')
    departure = departure_params(body.get('departure'))
    params = {'origin': origin, 'destination': destination, 'city': city, **departure}
    strategies = [STRATEGIES[p] for p in STRATEGIES if p in preferences] or ['0']
    routes, warnings = [], []
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs = [('步行', pool.submit(walking, body))]
        jobs += [('公交', pool.submit(transit, params, strategy)) for strategy in strategies]
        for mode, future in jobs:
            try:
                value = future.result()
                candidates = value['routes'] if mode == '步行' else value
                if not candidates:
                    warnings.append(mode + '未返回可展示方案（可能无班次或包含暂不支持的火车/出租车路段）。')
                for route in candidates:
                    if mode == '步行':
                        route = {**route, 'mode': mode, 'walkingDistance': route['distance'], 'transfers': 0}
                    if not any(r['mode'] == route['mode'] and r['steps'] == route['steps'] for r in routes):
                        routes.append(route)
            except ValueError as error:
                warnings.append(f'{mode}查询：{error}')
    if not routes:
        raise ValueError('暂无可用路线。' + '；'.join(warnings))
    # Sorting is deterministic and visible, not an invented model recommendation.
    def score(route):
        value = lambda field: route.get(field) if route.get(field) is not None else float('inf')
        metro = (0 if '地铁' in route.get('mode', '') else 1,) if '优先地铁' in preferences else ()
        if '减少步行' in preferences:
            return metro + (value('walkingDistance'), value('transfers'), value('duration'))
        if '少换乘' in preferences:
            return metro + (value('transfers'), value('duration'), value('walkingDistance'))
        return metro + (value('duration'), value('walkingDistance'), value('transfers'))
    routes.sort(key=score)
    for i, route in enumerate(routes):
        route['id'] = f'R{i+1}'
    base_ranking = '按步行距离、换乘次数、耗时排序' if '减少步行' in preferences else '按换乘次数、耗时排序' if '少换乘' in preferences else '按估算耗时排序'
    ranking = '优先地铁；' + base_ranking if '优先地铁' in preferences else base_ranking
    return {'routes': routes, 'warnings': warnings, 'source': '高德地图 Web 服务 · 步行与公交路径规划',
            'queriedAt': datetime.now(timezone.utc).isoformat(),
            'ranking': ranking,
            'notice': '普通出行方案，未核实台阶、电梯、盲道或临时障碍。公交出发时间用于班次筛选，耗时为估算；步行不预测未来路况。',
            'departure': body.get('departure') or '尽快出发'}
