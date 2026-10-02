"""VLC-backed companion window; never opens or writes the Vault library database."""
import json
import os
from pathlib import Path
import sys
import time

from native_playback import read_json, vlc_directory, write_json

VLC_ROOT = vlc_directory()
os.environ.setdefault('VLC_PLUGIN_PATH', str(VLC_ROOT / 'plugins'))
DLL_DIRECTORY = os.add_dll_directory(str(VLC_ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent / 'vendor'))
import vlc
from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QCursor, QKeySequence, QShortcut
from PySide6.QtWidgets import QApplication, QComboBox, QFrame, QHBoxLayout, QLabel, QPushButton, QSlider, QVBoxLayout, QWidget


def clock(seconds):
    seconds = max(0, int(seconds))
    return f'{seconds // 3600}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}' if seconds >= 3600 else f'{seconds // 60}:{seconds % 60:02d}'


class PlaybackClock:
    """Count elapsed viewing time only while the media position is advancing."""
    def __init__(self):
        self.seconds = 0.0
        self.previous = None

    def sample(self, now, position, playing, rate=1):
        if self.previous:
            before, prior_position, was_playing = self.previous
            elapsed, advance = now - before, position - prior_position
            # libVLC's position clock updates less often than this timer. Keep
            # the prior sample until movement arrives rather than losing time.
            if playing and was_playing and advance == 0 and elapsed <= 2:
                return
            if playing and was_playing and 0 < elapsed <= 3 and 0 < advance <= elapsed * max(1, rate) + 1:
                self.seconds += elapsed
        self.previous = (now, position, playing)

    def discontinuity(self):
        self.previous = None


class VlcWindow(QWidget):
    def __init__(self, folder, vlc_options=(), initial_volume=80):
        super().__init__()
        self.folder = Path(folder)
        self.request = read_json(self.folder / 'request.json')
        self.closed = False
        self.started = False
        self.sequence = 0
        self.last_publish = 0
        self.created = time.monotonic()
        self.current = float(self.request.get('resumeSeconds') or 0)
        self.duration = float(self.request.get('durationSeconds') or 0)
        self.resume = self.current
        self.resume_pending = self.resume > 0
        self.command_offset = 0
        self.clock = PlaybackClock()
        self.track_signature = None
        self.state = 'opening'
        self.error = ''
        self.setWindowTitle('The Vault Player — ' + self.request.get('title', 'Television'))
        self.resize(1200, 800)
        self.setStyleSheet('QWidget{background:#10140f;color:#edce86;font-family:Segoe UI;font-size:14px} QPushButton,QComboBox{background:#252c21;color:#edce86;border:1px solid #706142;padding:8px} QPushButton:hover{background:#3b4534} QSlider::groove:horizontal{background:#394133;height:6px} QSlider::handle:horizontal{background:#edce86;width:16px;margin:-5px 0}')
        self.root_layout = QVBoxLayout(self)
        self._normal_margins = self.root_layout.contentsMargins()
        self._normal_spacing = self.root_layout.spacing()
        self._cinema_fullscreen = False

        self.top_bar = QWidget()
        top = QHBoxLayout(self.top_bar)
        top.setContentsMargins(0, 0, 0, 0)
        self.back_button = QPushButton('Return to Vault')
        self.back_button.clicked.connect(self.close)
        self.title = QLabel(self.request.get('title', 'Television'))
        top.addWidget(self.back_button)
        top.addWidget(self.title, 1)
        self.root_layout.addWidget(self.top_bar)

        self.screen = QFrame()
        self.screen.setStyleSheet('background:black')
        self.screen.setAttribute(Qt.WidgetAttribute.WA_NativeWindow)
        self.screen.setMinimumSize(480, 270)
        self.root_layout.addWidget(self.screen, 1)

        self.transport_bar = QWidget()
        transport = QHBoxLayout(self.transport_bar)
        transport.setContentsMargins(0, 0, 0, 0)
        self.play_button = QPushButton('Pause')
        self.play_button.clicked.connect(self.toggle)
        self.restart_button = QPushButton('Start over')
        self.restart_button.clicked.connect(self.restart)
        self.position = QSlider(Qt.Orientation.Horizontal)
        self.position.setRange(0, 10000)
        self.position.sliderReleased.connect(self.seek)
        self.time_label = QLabel('0:00 / —')
        self.fullscreen_button = QPushButton('Fullscreen')
        self.fullscreen_button.clicked.connect(self.fullscreen)
        for widget in (self.play_button, self.restart_button, self.position, self.time_label, self.fullscreen_button):
            transport.addWidget(widget, 1 if widget is self.position else 0)
        self.root_layout.addWidget(self.transport_bar)

        self.tracks_bar = QWidget()
        tracks = QHBoxLayout(self.tracks_bar)
        tracks.setContentsMargins(0, 0, 0, 0)
        self.volume = QSlider(Qt.Orientation.Horizontal)
        self.volume.setRange(0, 100)
        self.volume.setValue(initial_volume)
        self.volume.setMaximumWidth(140)
        self.volume.setAccessibleName('Volume')
        self.mute = QPushButton('Mute')
        self.mute.setCheckable(True)
        self.audio = QComboBox()
        self.audio.setAccessibleName('Audio track')
        self.subtitles = QComboBox()
        self.subtitles.setAccessibleName('Subtitles')
        self.speed = QComboBox()
        self.speed.addItems(['0.75×', '1×', '1.25×', '1.5×', '2×'])
        self.speed.setCurrentIndex(1)
        for label, widget in [('Volume', self.volume), ('', self.mute), ('Audio', self.audio), ('Subtitles', self.subtitles), ('Speed', self.speed)]:
            if label:
                tracks.addWidget(QLabel(label))
            tracks.addWidget(widget)
        self.root_layout.addWidget(self.tracks_bar)

        self.status_label = QLabel('Opening with VLC…')
        self.root_layout.addWidget(self.status_label)
        self.chrome_widgets = (self.top_bar, self.transport_bar, self.tracks_bar, self.status_label)
        self.instance = vlc.Instance('--quiet', '--no-video-title-show', '--no-media-library', '--avcodec-hw=any', *vlc_options)
        if self.instance is None:
            raise RuntimeError('VLC could not initialize.')
        self.player = self.instance.media_player_new()
        self.player.set_hwnd(int(self.screen.winId()))
        self.player.video_set_mouse_input(False)
        self.player.video_set_key_input(False)
        self.volume.valueChanged.connect(lambda value: self.player.audio_set_volume(value))
        self.mute.toggled.connect(lambda value: self.player.audio_set_mute(value))
        self.audio.currentIndexChanged.connect(lambda index: self.player.audio_set_track(self.audio.itemData(index)) if index >= 0 else None)
        self.subtitles.currentIndexChanged.connect(lambda index: self.player.video_set_spu(self.subtitles.itemData(index)) if index >= 0 else None)
        self.speed.currentIndexChanged.connect(lambda index: self.player.set_rate([.75, 1, 1.25, 1.5, 2][index]))
        self.shortcuts = [QShortcut(QKeySequence('Space'), self, activated=self.toggle),
                          QShortcut(QKeySequence('Escape'), self, activated=self.escape),
                          QShortcut(QKeySequence('F'), self, activated=self.fullscreen)]
        self.timer = QTimer(self)
        self.timer.setInterval(250)
        self.timer.timeout.connect(self.tick)
        media = self.instance.media_new_path(self.request['path'])
        self.player.set_media(media)
        media.release()
        self.player.audio_set_volume(initial_volume)
        # Windows may retain a muted libVLC audio session from a previous
        # process. Match the visible controls rather than inheriting that mute.
        self.player.audio_set_mute(False)
        self.player.play()
        self.timer.start()

    def install_tracks(self):
        audio = self.player.audio_get_track_description() or []
        subtitles = self.player.video_get_spu_description() or []
        signature = (audio, subtitles)
        if signature == self.track_signature:
            return
        self.track_signature = signature
        for control, choices, selected in ((self.audio, audio, self.player.audio_get_track()), (self.subtitles, subtitles, self.player.video_get_spu())):
            control.blockSignals(True)
            control.clear()
            for identifier, label in choices:
                control.addItem(label.decode('utf-8', 'replace') if isinstance(label, bytes) else str(label), identifier)
            control.setCurrentIndex(control.findData(selected))
            control.setEnabled(bool(choices))
            control.blockSignals(False)

    def publish(self, state=None):
        if state:
            self.state = state
        self.sequence += 1
        write_json(self.folder / 'status.json', {**self.request, 'state': self.state, 'started': self.started,
            'sequence': self.sequence, 'currentSeconds': round(self.current, 2), 'durationSeconds': round(self.duration, 2),
            'sessionSeconds': round(self.clock.seconds, 2), 'completed': self.started and (self.state == 'ended' or self.duration > 0 and self.current / self.duration >= .9),
            'error': self.error, 'updatedAt': time.time()})
        self.last_publish = time.monotonic()

    def commands(self):
        path = self.folder / 'commands.jsonl'
        if not path.exists():
            return
        with path.open(encoding='utf-8') as stream:
            stream.seek(self.command_offset)
            lines = stream.readlines()
            self.command_offset = stream.tell()
        for line in lines:
            try:
                action = json.loads(line).get('action')
            except ValueError:
                continue
            if action == 'stop':
                self.close()
                return
            if action == 'restart':
                self.restart()
            elif action == 'toggle':
                self.toggle()
            elif action == 'focus':
                if self.isMinimized():
                    self.showNormal()
                self.raise_()
                self.activateWindow()

    def tick(self):
        if self.closed:
            return
        self.commands()
        if self.closed:
            return
        now = time.monotonic()
        state = self.player.get_state()
        position = self.player.get_time() / 1000
        length = self.player.get_length() / 1000
        if length > 0:
            self.duration = length
        playing = state == vlc.State.Playing
        if playing and not self.started:
            self.player.audio_set_volume(self.volume.value())
            self.player.audio_set_mute(self.mute.isChecked())
        if state == vlc.State.Error or not self.started and now - self.created > 25:
            self.error = 'VLC could not play this file. Your last saved position is unchanged.'
            self.publish('error')
            self.close()
            return
        if self.resume_pending:
            if self.player.is_seekable() and length > 0:
                self.player.set_time(int(min(self.resume, max(0, length - 1)) * 1000))
                self.current = self.resume
                self.resume_pending = False
                self.clock.discontinuity()
            # Do not report time zero while VLC is preparing a saved position.
        elif position >= 0:
            self.current = position
            if playing:
                self.started = True
            self.clock.sample(now, position, playing, self.player.get_rate())
        if state == vlc.State.Ended:
            self.current = max(self.current, self.duration)
            self.publish('ended')
            self.close()
            return
        self.state = 'playing' if playing else 'paused' if state == vlc.State.Paused else 'opening' if not self.started else 'buffering'
        self.play_button.setText('Play' if state == vlc.State.Paused else 'Pause')
        self.time_label.setText(f'{clock(self.current)} / {clock(self.duration)}')
        if self.duration and not self.position.isSliderDown():
            self.position.setValue(int(self.current / self.duration * 10000))
        if self.started:
            self.install_tracks()
        self.status_label.setText(('Using a readable alternate copy · ' if self.request.get('alternateUsed') else '') + self.state.capitalize() + ' · VLC')
        if now - self.last_publish >= 1:
            self.publish()

    def toggle(self):
        self.player.pause()
        self.clock.discontinuity()

    def restart(self):
        self.resume_pending = False
        self.current = 0
        self.player.set_time(0)
        self.player.set_pause(0)
        self.clock.discontinuity()
        self.publish()

    def seek(self):
        if self.duration > 0:
            self.current = self.duration * self.position.value() / 10000
            self.player.set_time(int(self.current * 1000))
            self.clock.discontinuity()

    def set_cinema_fullscreen(self, enabled):
        enabled = bool(enabled)
        if self._cinema_fullscreen == enabled:
            return
        self._cinema_fullscreen = enabled
        for widget in self.chrome_widgets:
            widget.setVisible(not enabled)
        if enabled:
            self.root_layout.setContentsMargins(0, 0, 0, 0)
            self.root_layout.setSpacing(0)
            self.screen.setMinimumSize(0, 0)
            cursor = QCursor(Qt.CursorShape.BlankCursor)
            self.setCursor(cursor)
            self.screen.setCursor(cursor)
        else:
            margins = self._normal_margins
            self.root_layout.setContentsMargins(
                margins.left(), margins.top(), margins.right(), margins.bottom())
            self.root_layout.setSpacing(self._normal_spacing)
            self.screen.setMinimumSize(480, 270)
            self.unsetCursor()
            self.screen.unsetCursor()

    def fullscreen(self):
        entering = not self.isFullScreen()
        self.set_cinema_fullscreen(entering)
        if entering:
            self.showFullScreen()
        else:
            self.showNormal()
        self.fullscreen_button.setText('Exit fullscreen' if entering else 'Fullscreen')

    def escape(self):
        if self.isFullScreen():
            self.fullscreen()
        else:
            self.close()

    def closeEvent(self, event):
        if not self.closed:
            self.closed = True
            self.timer.stop()
            # Keep the last good position: VLC may reset its clock after ending.
            self.publish(self.state if self.state in {'ended', 'error'} else 'closed')
            self.player.stop()
            self.player.release()
            self.instance.release()
        event.accept()


def main():
    folder = Path(sys.argv[1])
    try:
        app = QApplication(sys.argv[:1])
        window = VlcWindow(folder)
        window.show()
        return app.exec()
    except Exception as error:
        previous = read_json(folder / 'status.json')
        write_json(folder / 'status.json', {**previous, 'state': 'error', 'error': 'The VLC player could not initialize.', 'sequence': int(previous.get('sequence') or 0) + 1, 'updatedAt': time.time()})
        print(type(error).__name__, str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
