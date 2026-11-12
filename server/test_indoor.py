import unittest

import numpy as np

from indoor import frame_result, route, settings


class FakeDetector:
    """只验证契约，不加载权重：真实推理由 torch/ultralytics 负责。"""

    def __init__(self):
        self.seen = []

    def predict(self, frame, conf, mode):
        self.seen.append((frame.shape, conf, mode))
        return {'objects': [{'class_id': 1, 'name': 'chair', 'label': '椅子', 'confidence': 0.9,
                             'xyxy': [1.0, 2.0, 3.0, 4.0], 'side': '中间'}],
                'inference_ms': 1.0, 'device': 'CPU'}


class IndoorTests(unittest.TestCase):
    def test_confidence_bounds(self):
        for value in [0.35, 0.05, 0.95]:
            self.assertEqual(settings({'conf': value}), (value, 'project'))
        for value in [0, 0.04, 0.96, 1, 'nan', 'inf']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                settings({'conf': value})

    def test_unknown_mode_is_rejected(self):
        with self.assertRaisesRegex(ValueError, '未知模型'):
            settings({'mode': 'v9'})
        self.assertEqual(settings({'mode': 'v2'})[1], 'v2')

    def test_api_prefix_is_optional(self):
        self.assertEqual(route('/api/image'), '/image')
        self.assertEqual(route('/api/status'), '/status')
        self.assertEqual(route('/image'), '/image')

    def test_result_keeps_frontend_contract(self):
        frame = np.zeros((480, 640, 3), np.uint8)
        detector = FakeDetector()
        got = frame_result(detector, frame, 0.35, 'project')
        self.assertEqual(sorted(got), ['device', 'height', 'image', 'inference_ms',
                                       'objects', 'warning', 'width'])
        self.assertTrue(got['image'].startswith('data:image/jpeg;base64,'))
        self.assertEqual((got['width'], got['height']), (640, 480))
        self.assertEqual(got['objects'][0]['label'], '椅子')
        self.assertIsNone(got['warning'])

    def test_oversized_frame_is_downscaled_before_inference(self):
        detector = FakeDetector()
        frame_result(detector, np.zeros((1600, 2400, 3), np.uint8), 0.35, 'project')
        self.assertEqual(detector.seen[0][0][:2], (853, 1280))


if __name__ == '__main__':
    unittest.main()
