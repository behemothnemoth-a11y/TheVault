import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from native_playback import NativePlaybackService, choose_source, inspect_media, write_json


class SourceTests(unittest.TestCase):
    def test_uses_readable_alternate_without_changing_input(self):
        paths = ['bad.mp4', 'good.mkv']
        def inspect(path):
            if path == 'bad.mp4':
                raise ValueError('broken header')
            return path, 1300
        self.assertEqual(choose_source(paths, inspect), ('good.mkv', 1300, ['bad.mp4']))
        self.assertEqual(paths, ['bad.mp4', 'good.mkv'])

    def test_all_unreadable_is_an_error(self):
        with self.assertRaisesRegex(ValueError, 'None of'):
            choose_source(['bad'], lambda path: (_ for _ in ()).throw(ValueError()))

    def test_rejects_urls_and_nonlocal_paths(self):
        for path in ['https://example.com/a.mp4', r'\\server\share\a.mp4', 'relative.mp4']:
            with self.assertRaises(ValueError):
                inspect_media(path)

    def test_rejects_unbounded_or_malformed_candidates(self):
        for paths in [[], 'file.mp4', [None], ['x'] * 25]:
            with self.assertRaises(ValueError):
                choose_source(paths)


class SessionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.service = NativePlaybackService(self.temporary.name)
        self.token = 'a' * 40
        self.folder = Path(self.temporary.name) / self.token
        self.folder.mkdir()
        write_json(self.folder / 'request.json', {'token': self.token})

    def tearDown(self):
        self.temporary.cleanup()

    def test_session_path_cannot_escape(self):
        for token in ['../request', '/tmp', None, 'b' * 40]:
            with self.assertRaises(ValueError):
                self.service.status(token)

    def test_stale_player_keeps_last_position(self):
        write_json(self.folder / 'status.json', {'state': 'playing', 'currentSeconds': 123, 'sequence': 5, 'updatedAt': time.time() - 60})
        report = self.service.status(self.token)
        self.assertEqual(report['state'], 'error')
        self.assertEqual(report['currentSeconds'], 123)
        self.assertEqual(report['sequence'], 6)

    def test_final_result_survives_server_restart(self):
        write_json(self.folder / 'status.json', {'state': 'closed', 'currentSeconds': 123, 'sessionSeconds': 10, 'updatedAt': 0})
        self.assertEqual(self.service.status(self.token)['state'], 'closed')

    def test_controls_are_ordered_and_allowlisted(self):
        self.service.control(self.token, 'restart')
        self.service.control(self.token, 'stop')
        lines = (self.folder / 'commands.jsonl').read_text().splitlines()
        self.assertEqual([json.loads(line)['action'] for line in lines], ['restart', 'stop'])
        with self.assertRaises(ValueError):
            self.service.control(self.token, 'run arbitrary command')

    def test_embedded_launcher_owns_session_without_subprocess(self):
        class Handle:
            def poll(self): return None
        launched = []
        service = NativePlaybackService(self.temporary.name, lambda folder: launched.append(folder) or Handle())
        with patch('native_playback.choose_source', return_value=('D:\\episode.mkv', 1200, [])), patch('native_playback.vlc_directory'), patch('native_playback.subprocess.Popen') as spawn:
            result = service.start({'kind':'tv','showId':'show','episodeId':'episode','paths':['D:\\episode.mkv'],'resumeSeconds':40})
            self.assertEqual(len(launched), 1)
            self.assertEqual(service.status(result['token'])['currentSeconds'], 40)
            spawn.assert_not_called()
            with self.assertRaisesRegex(ValueError, 'current Vault player'):
                service.start({'kind':'tv','showId':'show','episodeId':'other','paths':['D:\\episode.mkv']})


if __name__ == '__main__':
    unittest.main()
