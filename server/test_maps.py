import unittest
from unittest.mock import patch
from maps import coordinate, places, walking


class MapsTests(unittest.TestCase):
    def test_bad_coordinates_do_not_reach_provider(self):
        for value in [None, '', '1,2,3', 'nan,1', '181,1', '1,91']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                coordinate(value)

    @patch('maps.amap')
    def test_candidates_preserve_ambiguity(self, provider):
        provider.return_value = {'pois': [{'id': 'a', 'name': '校区一', 'location': '118,32', 'address': []},
                                         {'id': 'b', 'name': '校区二', 'location': '118.1,32.1', 'address': '路1号'}]}
        result = places({'keywords': '学院', 'city': '南京'})
        self.assertEqual(len(result['places']), 2)
        self.assertEqual(result['places'][0]['address'], '')
        self.assertEqual(provider.call_args.args[1]['citylimit'], 'true')

    @patch('maps.amap')
    def test_empty_route_is_not_success(self, provider):
        provider.return_value = {'route': {'paths': []}}
        with self.assertRaisesRegex(ValueError, '未返回'):
            walking({'origin': '118,32', 'destination': '118.1,32.1'})

    @patch('maps.amap')
    def test_route_uses_provider_steps(self, provider):
        provider.return_value = {'route': {'paths': [{'distance': '120', 'duration': '100', 'steps': [{'instruction': '向东步行'}]}]}}
        result = walking({'origin': '118,32', 'destination': '118.1,32.1'})
        self.assertEqual(result['routes'][0], {'distance': 120, 'duration': 100, 'steps': ['向东步行']})
        self.assertIn('未核实', result['notice'])


if __name__ == '__main__':
    unittest.main()
