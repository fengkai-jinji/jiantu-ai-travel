import io
import json
import unittest
from unittest.mock import patch
import agent


def stream(*items):
    return io.BytesIO((''.join('data: '+json.dumps(item)+'\n\n' for item in items)+'data: [DONE]\n\n').encode())


class StreamTests(unittest.TestCase):
    def test_content_is_forwarded_without_hidden_reasoning(self):
        events=[]
        message,usage=agent.read_completion_stream(stream(
            {'choices':[{'delta':{'content':'你好','reasoning_content':'秘密'}}]},
            {'choices':[{'delta':{'content':'。'},'finish_reason':'stop'}]},
            {'choices':[],'usage':{'total_tokens':12}}),events.append)
        self.assertEqual(message['content'],'你好。')
        self.assertEqual(events,['你好','。'])
        self.assertEqual(usage,12)
        self.assertNotIn('reasoning_content',message)

    def test_tool_arguments_reassembled_across_fragments(self):
        message,_=agent.read_completion_stream(stream(
            {'choices':[{'delta':{'tool_calls':[{'index':0,'id':'c1','type':'function','function':{'name':'compare_routes','arguments':'{'}}]}}]},
            {'choices':[{'delta':{'tool_calls':[{'index':0,'function':{'arguments':'}'}}]},'finish_reason':'tool_calls'}]}),lambda _:None)
        self.assertEqual(message['tool_calls'][0]['function']['arguments'],'{}')
        self.assertEqual(message['tool_calls'][0]['id'],'c1')

    def test_truncated_stream_is_not_success(self):
        with self.assertRaises(ValueError):
            agent.read_completion_stream(io.BytesIO(b'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),lambda _:None)

    @patch('agent.search_nearby')
    def test_fast_map_progress_surrounds_actual_call(self,nearby):
        events=[]
        def call(*args,**kwargs):
            self.assertEqual(events[-1][0],'tool_start')
            return {'places':[],'radius':2000,'source':'test','queriedAt':'','centerName':'起点','keywords':'小吃'}
        nearby.side_effect=call
        agent.chat({'messages':[{'role':'user','content':'附近有什么小吃'}],'context':{'city':'南京','origin':'118,32','originName':'起点'}},emit=lambda kind,payload:events.append((kind,payload)))
        self.assertEqual(events[-1][0],'tool_end')
        self.assertEqual(events[-1][1]['status'],'完成')

    @patch('agent.completion')
    def test_model_tool_progress_and_results(self,model):
        model.side_effect=[{'role':'assistant','content':None,'tool_calls':[{'id':'x','type':'function','function':{'name':'compare_routes','arguments':'{}'}}]}, {'role':'assistant','content':'请确认起终点'}]
        events=[]
        result=agent.run_agent([{'role':'user','content':'规划路线'}],{},emit=lambda k,v:events.append((k,v)))
        self.assertEqual(result['trace'][0]['status'],'未完成')
        self.assertIn('tool_start',[k for k,_ in events])
        self.assertIn('tool_end',[k for k,_ in events])
        self.assertEqual(next(v for k,v in events if k=='tool_end')['status'],'未完成')


class StreamBudgetTests(unittest.TestCase):
    @patch('agent.settings', return_value={'LLM_BASE_URL':'https://example.invalid','LLM_MODEL':'test','LLM_API_KEY':'not-a-real-key'})
    @patch('agent.urlopen')
    @patch('token_guard.ensure_budget')
    @patch('token_guard.add')
    def test_disconnect_still_records_estimate_once(self, charge, ensure, api, settings):
        api.return_value=stream({'choices':[{'delta':{'content':'part'}}]})
        def disconnected(_):
            raise BrokenPipeError('test disconnected')
        with self.assertRaises((ValueError, BrokenPipeError)):
            agent.completion([{'role':'user','content':'test'}],[],on_delta=disconnected)
        self.assertEqual(charge.call_count,1)
        self.assertGreater(charge.call_args.args[0],0)

    @patch('agent.settings', return_value={'LLM_BASE_URL':'https://example.invalid','LLM_MODEL':'test','LLM_API_KEY':'not-a-real-key'})
    @patch('agent.urlopen')
    @patch('token_guard.ensure_budget')
    @patch('token_guard.add')
    def test_success_records_actual_usage_only_once(self, charge, ensure, api, settings):
        api.return_value=stream({'choices':[{'delta':{'content':'ok'},'finish_reason':'stop'}],'usage':{'total_tokens':9}})
        result=agent.completion([{'role':'user','content':'test'}],[],on_delta=lambda _:None)
        self.assertEqual(result['content'],'ok')
        charge.assert_called_once_with(9)
