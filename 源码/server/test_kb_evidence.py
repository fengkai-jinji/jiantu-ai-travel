"""Offline evidence policy checks: no configuration read or paid model call."""
import unittest
from unittest.mock import patch
import kb


class EvidenceTests(unittest.TestCase):
    @patch('kb.llm_ready', return_value=False)
    def test_verified_markers_are_preserved_and_counts_match_mixed_material(self, _):
        sources = kb.retrieve('什么是数字无障碍')
        sources[0] = {**sources[0], 'verified': True}
        with patch('kb.retrieve', return_value=sources):
            result = kb.ask({'question': '什么是数字无障碍'})
        self.assertTrue(result['sources'][0]['verified'])
        self.assertEqual(result['evidence']['verified'], 1)
        self.assertEqual(result['evidence']['unverified'], len(sources) - 1)

    @patch('kb.llm_ready', return_value=False)
    def test_all_verified_material_has_no_unverified_warning(self, _):
        source = {**kb.retrieve('什么是数字无障碍')[0], 'verified': True}
        with patch('kb.retrieve', return_value=[source]):
            result = kb.ask({'question': '什么是数字无障碍'})
        self.assertEqual(result['evidence'], {'total': 1, 'verified': 1, 'unverified': 0, 'warning': ''})

    @patch('kb.llm_ready', return_value=False)
    def test_library_reports_unverified_counts_without_promoting_sources(self, _):
        result = kb.ask({'question': '什么是数字无障碍'})
        evidence = result['evidence']
        self.assertEqual(evidence['total'], len(result['sources']))
        self.assertEqual(evidence['verified'], sum(s['verified'] is True for s in result['sources']))
        self.assertEqual(evidence['unverified'], evidence['total'] - evidence['verified'])
        self.assertIn('待核验', evidence['warning'])

    @patch('kb.completion')
    @patch('kb.llm_ready')
    def test_no_material_does_not_touch_configuration_or_model(self, ready, model):
        result = kb.ask({'question': '怎么做红烧肉'})
        self.assertEqual(result['evidence'], {'total': 0, 'verified': 0, 'unverified': 0, 'warning': ''})
        ready.assert_not_called()
        model.assert_not_called()

    @patch('kb.llm_ready', return_value=True)
    @patch('kb.completion', return_value={'content': '现有资料无法确认当前预约安排。来源1待核验。'})
    def test_model_policy_forbids_unverified_current_facts(self, model, _):
        result = kb.ask({'question': '去中山陵需要提前预约吗？'})
        policy = model.call_args.args[0][0]['content']
        self.assertIn('verified=false', policy)
        self.assertIn('不得', policy)
        self.assertIn('实时', policy)
        self.assertIn('待核验', result['evidence']['warning'])
        self.assertEqual(model.call_args.args[1], [])


if __name__ == '__main__':
    unittest.main()
