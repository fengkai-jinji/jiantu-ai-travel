import tempfile
import io
from types import SimpleNamespace
import unittest
from pathlib import Path
from unittest.mock import patch

from app import Handler, LiveState


class LiveUploadTests(unittest.TestCase):
    def test_start_keeps_original_upload_path_for_pruning(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / '测试区') as folder:
            state = LiveState(object(), Path(folder))
            video = Path(folder) / 'first.mp4'
            video.write_bytes(b'test video')
            state.uploads['first'] = video
            with patch('app.threading.Thread'):
                state.start({'kind': 'video', 'source': 'first'})
            self.assertEqual(state.active_upload, video)

    def test_second_upload_preserves_current_video_and_prunes_old_files(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / '测试区') as folder:
            state = LiveState(object(), Path(folder))
            current, obsolete = Path(folder) / 'first.mp4', Path(folder) / 'old.mp4'
            current.write_bytes(b'current video')
            obsolete.write_bytes(b'old video')
            state.uploads.update(first=current, old=obsolete)
            with patch('app.threading.Thread'):
                state.start({'kind': 'video', 'source': 'first'})
            handler = Handler.__new__(Handler)
            handler.server = SimpleNamespace(state=state)
            handler.path = '/api/video?name=second.mp4'
            handler.headers = {'Content-Length': '9'}
            handler.rfile = io.BytesIO(b'new video')
            responses = []
            handler.json_response = lambda value, status=200: responses.append((status, value))
            handler.do_POST()
            status, result = responses[0]
            self.assertEqual(status, 200)
            self.assertTrue(current.is_file(), '正在播放的视频不得被新上传剪除')
            self.assertIn('first', state.uploads)
            self.assertIn(result['id'], state.uploads)
            self.assertFalse(obsolete.exists(), '未使用的旧视频仍应清理')


if __name__ == '__main__':
    unittest.main()
