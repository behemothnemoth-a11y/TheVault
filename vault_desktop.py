"""Persistent Vault desktop shell with VLC inside the same window."""
import ctypes
import json
from pathlib import Path
import sys

from PySide6.QtCore import QFile, QIODevice, QLockFile, QObject, QTimer, QUrl, Slot
from PySide6.QtGui import QDesktopServices
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineScript
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QMainWindow, QStackedWidget, QMessageBox, QFileDialog, QWidget, QVBoxLayout, QLabel, QProgressBar
from native_playback import NativePlaybackService, write_json
from vault_vlc_player import VlcWindow
from desktop_pointer import WebPointerCoordinates

ROOT = Path(__file__).resolve().parent
PRIVATE = ROOT / 'data' / 'private'


class EmbeddedPlayer(VlcWindow):
    def __init__(self, folder, owner):
        self.owner = owner
        super().__init__(folder)
        # Retain only a lightweight process handle after this widget is deleted.
        self.handle = PlayerHandle(self)

    def fullscreen(self):
        entering = not self.owner.isFullScreen()
        self.set_cinema_fullscreen(entering)
        if entering:
            self.owner.stack.setCurrentWidget(self)
            self.owner.showFullScreen()
            self.setFocus()
        else:
            self.owner.show_work_area()
        self.fullscreen_button.setText('Exit fullscreen' if entering else 'Fullscreen')

    def escape(self):
        if self.owner.isFullScreen():
            self.fullscreen()
        else:
            self.close()

    def closeEvent(self, event):
        super().closeEvent(event)
        self.handle.done = True
        self.owner.stack.setCurrentWidget(self.owner.closing_screen if self.owner.closing else self.owner.web)
        if self.owner.isFullScreen():
            self.owner.show_work_area()
        if not self.owner.closing:
            self.owner.web.setFocus()
        self.owner.page.runJavaScript("window.dispatchEvent(new Event('vault-desktop-player-closed'))")


class PlayerHandle:
    def __init__(self, widget):
        self.done = False

    def poll(self):
        return 0 if self.done else None


class LocalPage(QWebEnginePage):
    def acceptNavigationRequest(self, url, kind, main):
        local = url.scheme() == 'http' and url.host() == '127.0.0.1' and url.port() == 4173
        if main and not local:
            if url.scheme() in ('http', 'https'):
                QDesktopServices.openUrl(url)
            return False
        return True


class Bridge(QObject):
    def __init__(self, owner):
        super().__init__(owner)
        self.owner = owner

    @Slot(str, result=str)
    def startPlayback(self, raw):
        try:
            return json.dumps(self.owner.service.start(json.loads(raw)))
        except Exception as error:
            return json.dumps({'ready': False, 'error': str(error)})

    @Slot(str)
    def archiveReady(self, raw):
        write_json(self.owner.private / 'desktop-verification.json', json.loads(raw))

    @Slot()
    def finishClose(self):
        self.owner.may_close = True
        self.owner.close()

    @Slot(str, result=bool)
    def closeProgress(self, message):
        self.owner.closing_status.setText(message)
        return True

    @Slot(str)
    def closeFailed(self, message):
        self.owner.closing = False
        self.owner.stack.setCurrentWidget(self.owner.web)
        self.owner.web.setFocus()
        QMessageBox.warning(self.owner, 'Vault is still open', 'Your save could not finish. The window will stay open so you can retry. ' + message[:200])


class VaultWindow(QMainWindow):
    def __init__(self, url, private=PRIVATE, load=True):
        super().__init__()
        self.private = Path(private)
        self.private.mkdir(parents=True, exist_ok=True)
        self.may_close = False
        self.closing = False
        self.setWindowTitle('The Vault: Reconstruction — Desktop')
        self.resize(1600, 950)
        self.stack = QStackedWidget(self)
        self.setCentralWidget(self.stack)
        self.profile = QWebEngineProfile('VaultDesktop', self)
        storage = self.private / 'desktop-profile'
        self.profile.setPersistentStoragePath(str(storage))
        self.profile.setCachePath(str(storage / 'cache'))
        self.profile.setPersistentCookiesPolicy(QWebEngineProfile.PersistentCookiesPolicy.ForcePersistentCookies)
        self.profile.downloadRequested.connect(self.download)
        self.web = QWebEngineView(self)
        self.web.setMouseTracking(True)
        self.pointer_coordinates = WebPointerCoordinates(self.web)
        QApplication.instance().installEventFilter(self.pointer_coordinates)
        self.page = LocalPage(self.profile, self.web)
        self.web.setPage(self.page)
        self.stack.addWidget(self.web)
        self.closing_screen = QWidget(self.stack)
        closing_layout = QVBoxLayout(self.closing_screen)
        closing_layout.setContentsMargins(60, 60, 60, 60)
        closing_layout.addStretch()
        title = QLabel('Closing The Vault')
        title.setStyleSheet('font-size: 30px; font-weight: bold; color: #f2bd49;')
        closing_layout.addWidget(title)
        self.closing_status = QLabel('Saving playback progress…')
        self.closing_status.setWordWrap(True)
        closing_layout.addWidget(self.closing_status)
        progress = QProgressBar()
        progress.setRange(0, 0)
        progress.setTextVisible(False)
        progress.setAccessibleName('Saving before closing')
        closing_layout.addWidget(progress)
        closing_layout.addWidget(QLabel('Vault will close automatically when saving is finished.'))
        closing_layout.addStretch()
        self.closing_screen.setStyleSheet('QWidget { background: #29251d; color: #d4cbb6; font-size: 18px; } QProgressBar { border: 1px solid #756b55; height: 14px; } QProgressBar::chunk { background: #f2bd49; }')
        self.stack.addWidget(self.closing_screen)
        self.player = None
        self.service = NativePlaybackService(self.private / 'native-playback', self.launch_player)
        self.channel = QWebChannel(self.page)
        self.bridge = Bridge(self)
        self.channel.registerObject('vaultDesktop', self.bridge)
        self.page.setWebChannel(self.channel)
        source = QFile(':/qtwebchannel/qwebchannel.js')
        if not source.open(QIODevice.OpenModeFlag.ReadOnly):
            raise RuntimeError('Desktop playback bridge is unavailable.')
        channel_js = bytes(source.readAll()).decode('utf-8')
        script = QWebEngineScript()
        script.setName('Vault desktop bridge')
        script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
        script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
        script.setRunsOnSubFrames(False)
        script.setSourceCode(channel_js + '\nwindow.vaultDesktopReady = new Promise(resolve => new QWebChannel(qt.webChannelTransport, channel => resolve(channel.objects.vaultDesktop)));')
        self.page.scripts().insert(script)
        self.web.loadFinished.connect(self.loaded)
        if load:
            self.web.setUrl(QUrl(url))

    def show_work_area(self):
        """Fill the usable Windows desktop without covering the taskbar."""
        self.showNormal()
        self.show()
        QTimer.singleShot(0, self._fit_work_area)

    def _fit_work_area(self):
        if sys.platform == 'win32':
            class Rect(ctypes.Structure):
                _fields_ = [('left', ctypes.c_long), ('top', ctypes.c_long),
                            ('right', ctypes.c_long), ('bottom', ctypes.c_long)]

            class MonitorInfo(ctypes.Structure):
                _fields_ = [('cbSize', ctypes.c_ulong), ('rcMonitor', Rect),
                            ('rcWork', Rect), ('dwFlags', ctypes.c_ulong)]

            user32 = ctypes.windll.user32
            hwnd = int(self.winId())
            monitor = user32.MonitorFromWindow(hwnd, 2)  # MONITOR_DEFAULTTONEAREST
            info = MonitorInfo()
            info.cbSize = ctypes.sizeof(MonitorInfo)
            if monitor and user32.GetMonitorInfoW(monitor, ctypes.byref(info)):
                work = info.rcWork
                width = max(1, work.right - work.left)
                height = max(1, work.bottom - work.top)
                flags = 0x0004 | 0x0010  # SWP_NOZORDER | SWP_NOACTIVATE
                user32.SetWindowPos(hwnd, 0, work.left, work.top, width, height, flags)
                return

        screen = self.screen() or QApplication.primaryScreen()
        if screen is not None:
            self.setGeometry(screen.availableGeometry())

    def launch_player(self, folder):
        if self.player:
            self.stack.removeWidget(self.player)
            self.player.deleteLater()
        self.player = EmbeddedPlayer(folder, self)
        self.stack.addWidget(self.player)
        self.stack.setCurrentWidget(self.player)
        # Reparenting a native video surface can change its Windows handle.
        self.player.player.set_hwnd(int(self.player.screen.winId()))
        self.player.setFocus()
        return self.player.handle

    def download(self, request):
        # Preserve the archive-export workflow in the desktop browser engine.
        destination, _ = QFileDialog.getSaveFileName(self, 'Save Vault export', str(Path.home() / 'Downloads' / request.downloadFileName()))
        if destination:
            path = Path(destination)
            request.setDownloadDirectory(str(path.parent))
            request.setDownloadFileName(path.name)
            request.accept()
        else:
            request.cancel()

    def loaded(self, ok):
        if ok:
            self.page.runJavaScript("""(async()=>{
              const store=await import(new URL('./js/core/store.js', location.href).href);
              while(!store.getStorageStatus().ready) await new Promise(r=>setTimeout(r,250));
              const s=store.getState(), items=Object.values(s.items), episodes=items.flatMap(i=>Object.values(i.episodes||{}));
              (await window.vaultDesktopReady).archiveReady(JSON.stringify({items:items.length,tv:items.filter(i=>i.wing==='tv').length,episodes:episodes.length,completed:episodes.filter(e=>e.status==='completed').length,watchSeconds:episodes.reduce((n,e)=>n+Number(e.totalWatchSeconds||0),0),ids:Object.keys(s.items).sort(),verifiedAt:new Date().toISOString()}));
            })().catch(console.error)""")

    def closeEvent(self, event):
        if self.may_close:
            write_json(self.private / 'desktop-pointer-report.json', {
                'checked': self.pointer_coordinates.checked,
                'corrected': self.pointer_coordinates.corrected})
            event.accept()
            return
        event.ignore()
        if self.closing:
            return
        self.closing = True
        self.closing_status.setText('Saving playback progress…')
        self.stack.setCurrentWidget(self.closing_screen)
        # Let the native closing screen paint before stopping VLC and saving.
        QTimer.singleShot(100, self.save_and_close)

    def save_and_close(self):
        if self.player and not self.player.closed:
            self.player.close()
        self.page.runJavaScript("""(async()=>{
          const bridge=await window.vaultDesktopReady;
          try {
            const playback=await import(new URL('./js/systems/nativeTvPlayback.js', location.href).href);
            await playback.flushNativePlayback();
            const store=await import(new URL('./js/core/store.js', location.href).href);
            await store.saveDesktopOnClose(message => new Promise(resolve => bridge.closeProgress(message, resolve)));
            bridge.finishClose();
          } catch(error) { bridge.closeFailed(error.message); }
        })()""")


def main():
    app = QApplication(sys.argv[:1])
    app.setApplicationName('VaultDesktop')
    PRIVATE.mkdir(parents=True, exist_ok=True)
    lock = QLockFile(str(PRIVATE / 'desktop.lock'))
    if not lock.tryLock(0):
        QMessageBox.information(None, 'The Vault', 'The Vault desktop window is already open.')
        return 0
    window = VaultWindow(sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4173/')
    window.show_work_area()
    return app.exec()


if __name__ == '__main__':
    sys.exit(main())
