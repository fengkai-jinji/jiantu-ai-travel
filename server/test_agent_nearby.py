import unittest
from unittest.mock import patch
from maps import nearby
from agent import chat

CONTEXT={'city':'南京','origin':'118.7,32.0','originName':'测试出发地','destination':'118.8,32.1','destinationName':'测试目的地'}
RESULT={'places':[{'id':'poi1','name':'测试小吃店','address':'测试路1号','location':'118.701,32.001','distance':120,'type':'餐饮服务;快餐厅'}], 'radius':2000,'source':'高德地图 Web 服务 · 周边搜索','queriedAt':'2026-11-07T00:00:00Z'}
def body(message,context=None):
    return {'messages':[{'role':'user','content':message}],'context':CONTEXT if context is None else context}

class NearbyAdapterTests(unittest.TestCase):
    @patch('maps.amap')
    def test_uses_confirmed_center_and_real_distance(self,api):
        api.return_value={'pois':[{'id':'a','name':'真实返回店名','location':'118.701,32.001','address':[],'distance':'123','type':'餐饮服务'}]}
        result=nearby({'location':CONTEXT['origin'],'keywords':'小吃'})
        args=api.call_args.args
        self.assertEqual(args[0],'place/around')
        self.assertEqual(args[1]['location'],'118.7,32.0')
        self.assertEqual(args[1]['types'],'050000')
        self.assertEqual(args[1]['sortrule'],'distance')
        self.assertEqual(args[1]['radius'],2000)
        self.assertLessEqual(int(args[1]['offset']),5)
        self.assertEqual(result['places'][0]['distance'],123)
        self.assertEqual(result['places'][0]['address'],'')
        self.assertNotIn('rating',result['places'][0])

    @patch('maps.amap')
    def test_invalid_center_never_reaches_provider(self,api):
        for location in ['',None,'nan,32','181,32']:
            with self.subTest(location=location),self.assertRaises(ValueError):
                nearby({'location':location,'keywords':'小吃'})
        api.assert_not_called()

    @patch('maps.amap')
    def test_malformed_poi_is_skipped_and_unknown_distance_is_not_zero(self,api):
        api.return_value={'pois':[{'name':'坏坐标','location':'nan,32'},{'id':'b','name':'店乙','location':'118.7,32','distance':[],'address':'路2号'}]}
        result=nearby({'location':CONTEXT['origin'],'keywords':'小吃'})
        self.assertEqual(len(result['places']),1)
        self.assertIsNone(result['places'][0]['distance'])

    @patch('maps.amap',return_value={'pois':[]})
    def test_empty_results_stay_empty(self,_):
        self.assertEqual(nearby({'location':CONTEXT['origin'],'keywords':'小吃'})['places'],[])

class NearbyAgentTests(unittest.TestCase):
    @patch('agent.completion')
    @patch('agent.nearby',return_value=RESULT)
    def test_common_food_request_skips_llm_and_returns_selectable_evidence(self,api,model):
        result=chat(body('我想去周围小吃吃东西，推荐几家'))
        model.assert_not_called()
        self.assertEqual(api.call_args.args[0]['location'],CONTEXT['origin'])
        self.assertEqual(result['nearby'][0]['centerName'],'测试出发地')
        self.assertEqual(result['nearby'][0]['places'][0]['location'],'118.701,32.001')
        self.assertIn('直线',result['answer'])
        self.assertIsNone(result['comparison'])

    @patch('agent.llm_ready',return_value=False)
    @patch('agent.nearby',return_value=RESULT)
    def test_nearby_search_still_works_without_llm(self,api,_):
        self.assertTrue(chat(body('附近有什么小吃'))['nearby'])

    @patch('agent.completion')
    @patch('agent.nearby')
    def test_missing_origin_asks_for_confirmed_position(self,api,model):
        result=chat(body('推荐周边的小吃',{'city':'南京'}))
        api.assert_not_called();model.assert_not_called()
        self.assertIn('出发地',result['answer'])
        self.assertFalse(result['nearby'])

    @patch('agent.nearby',return_value=RESULT)
    def test_explicit_destination_uses_destination(self,api):
        result=chat(body('推荐目的地附近的小吃'))
        self.assertEqual(api.call_args.args[0]['location'],CONTEXT['destination'])
        self.assertEqual(result['nearby'][0]['centerName'],'测试目的地')

    @patch('agent.nearby')
    def test_missing_explicit_destination_does_not_fall_back_to_origin(self,api):
        result=chat(body('推荐目的地附近的小吃',{'origin':CONTEXT['origin'],'city':'南京'}))
        api.assert_not_called();self.assertIn('目的地',result['answer'])

    @patch('agent.llm_ready',return_value=True)
    @patch('agent.completion',return_value={'role':'assistant','content':'好的，不推荐餐饮。'})
    @patch('agent.nearby')
    def test_negative_request_does_not_trigger_food_search(self,api,model,_):
        self.assertIn('不推荐',chat(body('不要推荐附近小吃，我要去医院'))['answer'])
        api.assert_not_called();model.assert_called_once()

    @patch('agent.nearby',return_value={**RESULT,'places':[]})
    def test_no_pois_does_not_invent_shops(self,_):
        result=chat(body('附近有什么小吃'))
        self.assertIn('没有找到',result['answer'])
        self.assertEqual(result['nearby'][0]['places'],[])

    @patch('agent.llm_ready',return_value=True)
    @patch('agent.completion',return_value={'role':'assistant','content':'请先确认南京南站的位置或补充需求。'})
    @patch('agent.nearby')
    def test_named_other_location_or_constraints_do_not_use_unqualified_fast_search(self,api,model,_):
        for message in ['推荐南京南站附近的小吃','我想吃附近二十元以内的小吃','推荐附近不辣的小吃','附近的小吃帮我推荐夫子庙那边的']:
            with self.subTest(message=message):
                chat(body(message))
        api.assert_not_called();self.assertEqual(model.call_count,4)

    @patch('agent.nearby',return_value=RESULT)
    def test_confirmed_named_destination_uses_its_actual_center(self,api):
        chat(body('推荐测试目的地附近的小吃'))
        self.assertEqual(api.call_args.args[0]['location'],CONTEXT['destination'])

    @patch('agent.completion')
    @patch('agent.nearby',return_value=RESULT)
    def test_generic_good_food_query_is_supported(self,api,model):
        chat(body('帮我找一下周边有什么好吃的'))
        api.assert_called_once();model.assert_not_called()

    @patch('agent.llm_ready',return_value=True)
    @patch('agent.completion',return_value={'role':'assistant','content':'饮食和预算条件需要进一步核实。'})
    @patch('agent.nearby',return_value=RESULT)
    def test_history_and_form_constraints_are_not_bypassed(self,api,model,_):
        cases=[{**body('附近有什么小吃'), 'messages':[{'role':'user','content':'只推荐素食，预算20元'},{'role':'assistant','content':'需要核实条件。'},{'role':'user','content':'附近有什么小吃'}]},
               body('附近有什么小吃',{**CONTEXT,'needs':'只推荐素食，预算20元'}),body('推荐附近的素食小吃')]
        for request in cases:
            with self.subTest(request=request):
                chat(request)
        api.assert_not_called();self.assertEqual(model.call_count,3)

    @patch('agent.llm_ready',return_value=True)
    @patch('agent.nearby',return_value=RESULT)
    @patch('agent.completion')
    def test_general_agent_can_call_nearby_tool(self,model,api,_):
        model.side_effect=[{'role':'assistant','content':None,'tool_calls':[{'id':'x','type':'function','function':{'name':'search_nearby','arguments':'{"keywords":"咖啡","anchor":"destination"}'}}]}, {'role':'assistant','content':'请查看高德返回的咖啡店。'}]
        result=chat(body('帮我安排到达后的休息地点'))
        self.assertEqual(api.call_args.args[0]['location'],CONTEXT['destination'])
        self.assertEqual(len(result['nearby']),1)

    @patch('agent.llm_ready',return_value=True)
    @patch('agent.nearby')
    @patch('agent.completion')
    def test_tool_cannot_supply_arbitrary_coordinates(self,model,api,_):
        model.side_effect=[{'role':'assistant','content':None,'tool_calls':[{'id':'x','type':'function','function':{'name':'search_nearby','arguments':'{"keywords":"小吃","anchor":"origin","location":"1,2"}'}}]}, {'role':'assistant','content':'请确认位置。'}]
        result=chat(body('安排一下吃饭'))
        api.assert_not_called();self.assertEqual(result['trace'][0]['status'],'未完成')

    @patch('agent.llm_ready',return_value=True)
    @patch('agent.completion')
    def test_model_iterations_and_timeout_are_bounded(self,model,_):
        model.return_value={'role':'assistant','content':None,'tool_calls':[{'id':'x','type':'function','function':{'name':'unknown','arguments':'{}'}}]}
        chat(body('测试复杂请求'))
        self.assertLessEqual(model.call_count,2)
        self.assertLessEqual(model.call_args.kwargs['timeout'],20)

if __name__=='__main__':unittest.main()
