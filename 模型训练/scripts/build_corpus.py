"""从 knowledge.json 与工具轨迹样例生成 GLM 微调 JSONL（chat 格式）。
用法：F:/Miniconda/envs/yolo/python.exe -X utf8 scripts/build_corpus.py > data/jiantu-sft.jsonl"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'server'
KB = json.loads((ROOT / 'knowledge.json').read_text(encoding='utf-8'))
SYSTEM = '你是见途的无障碍行前助手。只依据提供的资料回答，注明来源；资料不足明确说明，不编造。'

def entry_sample(entry):
    user = f"{entry['title']}怎么样？"
    answer = f"{entry['summary']}（来源：{entry['publisher']}，{entry['date']}）开放与预约细节以官方渠道为准。"
    return {'messages': [
        {'role': 'system', 'content': SYSTEM},
        {'role': 'user', 'content': user},
        {'role': 'assistant', 'content': answer},
    ]}

def tool_sample():
    return {'messages': [
        {'role': 'system', 'content': SYSTEM + ' 比较路线必须调用 compare_routes 工具。'},
        {'role': 'user', 'content': '帮我比较去茂业天地的路线，少换乘'},
        {'role': 'assistant', 'content': None, 'tool_calls': [
            {'id': 'call_1', 'type': 'function',
             'function': {'name': 'compare_routes', 'arguments': '{}}'}}
        ]},
        {'role': 'tool', 'tool_call_id': 'call_1', 'content': json.dumps(
            {'routes': [{'id': 'R1', 'mode': '公交＋地铁', 'duration': 3540, 'transfers': 1}]}, ensure_ascii=False)},
        {'role': 'assistant', 'content': '第1 推荐方案 R1（公交＋地铁），约 59 分钟、换乘 1 次，数据来自高德路径规划；台阶与电梯仍需人工核实。'},
    ]}

def main():
    out = [entry_sample(e) for e in KB['entries'] if e.get('summary')]
    out.append(tool_sample())
    for item in out:
        print(json.dumps(item, ensure_ascii=False))
    sys.stderr.write(f'生成 {len(out)} 条样本\n')

if __name__ == '__main__':
    main()
