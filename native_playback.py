"""Local VLC sessions. Media is inspected read-only; the browser owns the archive."""
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parent
EXTENSIONS = {'.avi', '.m2ts', '.m4v', '.mkv', '.mov', '.mp4', '.mpeg', '.mpg', '.rmvb', '.ts', '.vob', '.webm', '.wmv'}
TERMINAL = {'closed', 'ended', 'error'}


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    os.replace(temporary, path)


def read_json(path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def vlc_directory():
    for base in (os.environ.get('ProgramFiles', r'C:\Program Files'), os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')):
        folder = Path(base) / 'VideoLAN' / 'VLC'
        if (folder / 'libvlc.dll').is_file():
            return folder
    raise OSError('VLC is not installed in its usual location.')


def ffprobe_executable():
    direct = shutil.which('ffprobe')
    if direct:
        return direct
    packages = Path(os.environ.get('LOCALAPPDATA', '')) / 'Microsoft' / 'WinGet' / 'Packages'
    matches = sorted(packages.glob('Gyan.FFmpeg.Essentials_*/ffmpeg-*-essentials_build/bin/ffprobe.exe'))
    if matches:
        return str(matches[-1])
    raise OSError('The local media inspector is unavailable.')


def inspect_media(raw_path):
    if not isinstance(raw_path, str) or len(raw_path) > 2000 or not re.match(r'^[CD]:[\\/]', raw_path, re.I):
        raise ValueError('Only local C: or D: video files can be played.')
    path = Path(raw_path).resolve(strict=True)
    if path.suffix.lower() not in EXTENSIONS or not path.is_file():
        raise ValueError('This is not a supported local video file.')
    result = subprocess.run(
        [ffprobe_executable(), '-v', 'error', '-show_entries', 'stream=codec_type,codec_name:format=duration', '-of', 'json', str(path)],
        capture_output=True, encoding='utf-8', errors='replace', timeout=15,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if result.returncode:
        raise ValueError('The file has unreadable media headers.')
    info = json.loads(result.stdout)
    if not any(stream.get('codec_type') == 'video' for stream in info.get('streams', [])):
        raise ValueError('The file contains no readable video track.')
    try:
        duration = float(info.get('format', {}).get('duration', 0))
    except (ValueError, TypeError):
        duration = 0
    return str(path), duration if math.isfinite(duration) and duration > 0 else 0


def choose_source(paths, inspector=inspect_media):
    if not isinstance(paths, list) or not paths or len(paths) > 24 or any(not isinstance(p, str) for p in paths):
        raise ValueError('Choose an episode with a local video file.')
    failures = []
    for path in dict.fromkeys(paths):
        try:
            selected, duration = inspector(path)
            return selected, duration, failures
        except (OSError, ValueError, subprocess.TimeoutExpired):
            failures.append(path)
    raise ValueError('None of this episode’s saved copies could be read. No files or links were changed.')


class NativePlaybackService:
    def __init__(self, directory, launcher=None):
        self.directory = Path(directory)
        self.launcher = launcher
        self.lock = threading.Lock()
        self.processes = {}

    def folder(self, token):
        if not isinstance(token, str) or not re.fullmatch(r'[a-f0-9]{40}', token):
            raise ValueError('Invalid playback session.')
        folder = self.directory / token
        if not (folder / 'request.json').is_file():
            raise ValueError('Playback session not found.')
        return folder

    def start(self, body):
        vlc_directory()
        if importlib.util.find_spec('PySide6') is None:
            raise OSError('The Vault native player runtime is unavailable.')
        if body.get('kind') != 'tv' or not all(isinstance(body.get(key), str) and re.fullmatch(r'[a-zA-Z0-9_-]{1,200}', body[key]) for key in ('showId', 'episodeId')):
            raise ValueError('Invalid episode identity.')
        path, duration, skipped = choose_source(body.get('paths'))
        resume = float(body.get('resumeSeconds') or 0)
        if not math.isfinite(resume):
            raise ValueError('Invalid resume position.')
        resume = max(0, min(resume, max(0, duration - 1) if duration else 864000))
        with self.lock:
            # One player per Vault process; a second click must not overlap audio.
            for token, process in list(self.processes.items()):
                if process.poll() is None and self.status(token).get('state') not in TERMINAL:
                    raise ValueError('Close the current Vault player before opening another episode.')
                if process.poll() is not None:
                    del self.processes[token]
            token = secrets.token_hex(20)
            folder = self.directory / token
            folder.mkdir(parents=True)
            request = {'token': token, 'kind': 'tv', 'showId': body['showId'], 'episodeId': body['episodeId'],
                       'title': str(body.get('title') or 'The Vault')[:300], 'path': path, 'durationSeconds': duration,
                       'resumeSeconds': resume, 'alternateUsed': bool(skipped), 'createdAt': time.time()}
            write_json(folder / 'request.json', request)
            write_json(folder / 'status.json', {**request, 'state': 'opening', 'started': False, 'sequence': 0, 'sessionSeconds': 0, 'currentSeconds': resume, 'updatedAt': time.time()})
            try:
                if self.launcher:
                    self.processes[token] = self.launcher(folder)
                    return {'ready': True, **request}
                with (folder / 'player.log').open('wb') as log:
                    self.processes[token] = subprocess.Popen(
                        [sys.executable, str(ROOT / 'vault_vlc_player.py'), str(folder)], cwd=ROOT,
                        stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            except OSError:
                write_json(folder / 'status.json', {**request, 'state': 'error', 'started': False, 'error': 'The VLC player could not start.'})
                raise
            return {'ready': True, **request}

    def status(self, token):
        folder = self.folder(token)
        status = read_json(folder / 'status.json')
        process = self.processes.get(token)
        expired = time.time() - float(status.get('updatedAt') or 0) > 30
        if status.get('state') not in TERMINAL and ((process is not None and process.poll() is not None) or expired):
            status = {**status, 'state': 'error', 'error': 'The VLC player stopped unexpectedly. The last saved position is retained.', 'sequence': int(status.get('sequence') or 0) + 1}
        return {'ready': True, **status}

    def control(self, token, action):
        if action not in {'stop', 'focus', 'restart', 'toggle'}:
            raise ValueError('Unknown player action.')
        with self.lock:
            folder = self.folder(token)
            with (folder / 'commands.jsonl').open('a', encoding='utf-8') as stream:
                stream.write(json.dumps({'action': action}) + '\n')
        return {'ready': True}
