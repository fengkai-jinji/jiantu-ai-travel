import unittest
from unittest.mock import patch
from routes import compare
from agent import place_request
from agent import chat

CONTEXT = {'origin': '118,32', 'destination': '118.1,32.1', 'city': '南京', 'preferences': ['少换乘']}


class ComparisonTests(unittest.TestCase):
    @patch('routes.walking')
    @patch('routes.amap')
    def test_metro_modes_and_priority_sorting(self, api, walk):
        walk.return_value = {'routes': [{'distance': 9000, 'duration': 7000, 'steps': ['向东步行']} ]}
        bus = {'name': '公交1路', 'type': '普通公交线路', 'departure_stop': {'name': '丙站'}, 'arrival_stop': {'name': '丁站'}, 'distance': '1000'}
        metro = {'name': '地铁1号线', 'type': '地铁线路', 'departure_stop': {'name': '甲站'}, 'arrival_stop': {'name': '乙站'}, 'distance': '8000'}
        metro2 = {'name': '地铁2号线', 'type': '地铁线路', 'departure_stop': {'name': '戊站'}, 'arrival_stop': {'name': '己站'}, 'distance': '9000'}
        api.return_value = {'route': {'transits': [
            {'duration': '3600', 'walking_distance': '500', 'segments': [{'walking': {}, 'bus': {'buslines': [dict(bus)]}}]},
            {'duration': '3000', 'walking_distance': '400', 'segments': [{'walking': {}}, {'bus': {'buslines': [dict(metro)]}}, {'walking': {}}, {'bus': {'buslines': [dict(bus)]}}]},
            {'duration': '3300', 'walking_distance': '300', 'segments': [{'walking': {}}, {'bus': {'buslines': [dict(metro2)]}}]}
        ]}}
        result = compare({**CONTEXT, 'preferences': ['优先地铁']})
        modes = [r['mode'] for r in result['routes']]
        self.assertIn('公交＋地铁', modes)
        self.assertIn('地铁', modes)
        self.assertIn('公交', modes)
        self.assertTrue(modes[0].startswith(('地铁', '公交＋地铁')))
        mixed = next(r for r in result['routes'] if r['mode'] == '公交＋地铁')
        self.assertEqual([leg['kind'] for leg in mixed['legs']], ['地铁', '公交'])
        self.assertIn('优先地铁', result['ranking'])
    @patch('routes.walking')
    @patch('routes.amap')
    def test_preference_and_actual_transit_steps(self, api, walk):
        walk.return_value = {'routes': [{'distance': 9000, 'duration': 7000, 'steps': ['向东步行']} ]}
        # 高德真实返回里每个 segment 都带空占位 railway/taxi，不能据此判为不支持。
        placeholder = {'via_stops': [], 'alters': [], 'spaces': []}
        api.return_value = {'route': {'transits': [{'duration': '1800', 'walking_distance': '300', 'cost': '2', 'segments': [
            {'walking': {'steps': [{'instruction': '步行到车站'}]}, 'bus': {'buslines': [{'name': '公交1路', 'departure_stop': {'name': '甲站'}, 'arrival_stop': {'name': '乙站'}, 'distance': '5000'}]}},
            {'walking': {'distance': '200'}, 'bus': {}, 'railway': placeholder, 'taxi': []}
        ]}]}}
        result = compare(CONTEXT)
        self.assertEqual(api.call_args.args[1]['strategy'], '2')
        bus = next(r for r in result['routes'] if r['mode'] == '公交')
        self.assertEqual(bus['transfers'], 0)
        self.assertEqual(bus['walkingDistance'], 300)
        self.assertIn('公交1路', ' '.join(bus['steps']))
        self.assertIn('未核实', result['notice'])

    @patch('routes.walking')
    @patch('routes.amap')
    def test_real_railway_segment_is_excluded(self, api, walk):
        walk.return_value = {'routes': [{'distance': 300, 'duration': 250, 'steps': ['步行']} ]}
        api.return_value = {'route': {'transits': [{'duration': '1800', 'walking_distance': '300', 'segments': [
            {'walking': {}, 'railway': {'id': 'r1', 'name': 'G101', 'departure_stop': {'name': '南京南站'}, 'arrival_stop': {'name': '雨花台'}, 'stops': [{'name': '南京南站'}]}}
        ]}]}}
        result = compare(CONTEXT)
        self.assertFalse(any(r['mode'] == '公交' for r in result['routes']))
        self.assertTrue(result['warnings'])

    @patch('routes.walking', side_effect=ValueError('步行不可用'))
    @patch('routes.amap', return_value={'route': {'transits': []}})
    def test_no_fake_route_on_all_failures(self, *_):
        with self.assertRaises(ValueError):
            compare(CONTEXT)

    @patch('routes.walking', return_value={'routes': [{'distance': 300, 'duration': 250, 'steps': ['步行']} ]})
    @patch('routes.amap', side_effect=ValueError('公交配额不足'))
    def test_partial_failure_is_visible(self, *_):
        result = compare(CONTEXT)
        self.assertEqual(len(result['routes']), 1)
        self.assertTrue(result['warnings'])


class AgentTests(unittest.TestCase):
    @patch('kb.retrieve')
    @patch('agent.llm_ready', return_value=True)
    @patch('agent.completion')
    def test_lookup_knowledge_answers_from_library(self, model, _, retrieve):
        retrieve.return_value = [{'title': '雨花台风景区', 'summary': '免费开放的城市风景区。', 'publisher': '景区官方渠道', 'date': '2026-11-07', 'verified': False}]
        model.side_effect = [
            {'role': 'assistant', 'content': None, 'tool_calls': [{'id': 'k1', 'type': 'function', 'function': {'name': 'lookup_knowledge', 'arguments': '{"question": "雨花台怎么样"}'}}]},
            {'role': 'assistant', 'content': '依据知识库（雨花台风景区）：免费开放的城市风景区。'}
        ]
        result = chat({'messages': [{'role': 'user', 'content': '雨花台怎么样'}], 'context': {}})
        self.assertEqual(result['trace'][0]['tool'], 'lookup_knowledge')
        tool_message = model.call_args.args[0][-1]
        self.assertIn('雨花台风景区', tool_message['content'])
        self.assertIn('免费开放', tool_message['content'])
    @patch('agent.llm_ready', return_value=True)
    @patch('agent.completion', return_value={'role': 'assistant', 'content': '现在出发。'})
    def test_empty_departure_is_explicit_asap(self, model, _):
        chat({'messages': [{'role': 'user', 'content': '比较路线'}], 'context': {**CONTEXT, 'departure': ''}})
        system = model.call_args.args[0][0]['content']
        self.assertIn('"departureMode": "asap"', system)
        self.assertIn('无需补问具体时刻', system)

    @patch('agent.llm_ready', return_value=False)
    def test_missing_key_does_not_fake_response(self, _):
        with self.assertRaisesRegex(ValueError, 'LLM_API_KEY'):
            chat({'messages': [{'role': 'user', 'content': '帮我出行'}]})

    @patch('agent.llm_ready', return_value=True)
    @patch('agent.completion')
    @patch('agent.compare')
    def test_no_route_without_confirmed_endpoints(self, route, model, _):
        model.side_effect = [ {'role': 'assistant', 'content': None, 'tool_calls': [{'id': '1', 'type': 'function', 'function': {'name': 'compare_routes', 'arguments': '{}'}}]}, {'role': 'assistant', 'content': '请先确认校区。'} ]
        result = chat({'messages': [{'role': 'user', 'content': '去商场'}], 'context': {}})
        route.assert_not_called()
        self.assertIn('确认', result['answer'])

    @patch('agent.llm_ready', return_value=True)
    @patch('agent.completion')
    @patch('agent.compare')
    def test_tool_result_returned_as_evidence(self, route, model, _):
        route.return_value = {'routes': [{'id': 'w1', 'mode': '步行', 'steps': ['向东']}], 'source': '高德', 'warnings': []}
        model.side_effect = [ {'role': 'assistant', 'content': None, 'tool_calls': [{'id': '1', 'type': 'function', 'function': {'name': 'compare_routes', 'arguments': '{}'}}]}, {'role': 'assistant', 'content': '方案 w1 来自高德，设施待核实。'} ]
        result = chat({'messages': [{'role': 'user', 'content': '比较路线'}], 'context': CONTEXT})
        self.assertEqual(result['comparison']['source'], '高德')
        self.assertEqual(result['trace'][0]['status'], '完成')
        self.assertEqual(model.call_args.args[0][-1]['tool_call_id'], '1')

    @patch('agent.llm_ready', return_value=True)
    @patch('agent.completion')
    def test_unknown_tools_are_never_executed_and_loop_is_bounded(self, model, _):
        model.return_value = {'role': 'assistant', 'content': None, 'tool_calls': [{'id': 'x', 'type': 'function', 'function': {'name': 'run_shell', 'arguments': '{}'}}]}
        result = chat({'messages': [{'role': 'user', 'content': '测试'}]})
        self.assertLessEqual(model.call_count, 4)
        self.assertIn('上限', result['answer'])


if __name__ == '__main__':
    unittest.main()
