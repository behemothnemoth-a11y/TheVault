"""Offscreen event tests; never move the system pointer or show a window."""
import os
os.environ['QT_QPA_PLATFORM'] = 'offscreen'
os.environ['QT_SCALE_FACTOR'] = '2'
import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from PySide6.QtCore import QPointF, QEvent, Qt
from PySide6.QtGui import QMouseEvent
from PySide6.QtWidgets import QApplication, QWidget
from desktop_pointer import WebPointerCoordinates

app = QApplication.instance() or QApplication([])

class Surface(QWidget):
    def mouseMoveEvent(self, event):
        self.received = event.position()
        event.accept()
    mousePressEvent = mouseMoveEvent
    mouseReleaseEvent = mouseMoveEvent

class PointerTests(unittest.TestCase):
    def setUp(self):
        self.window = QWidget()
        self.web = QWidget(self.window)
        self.web.setGeometry(21, 49, 500, 500)
        self.surface = Surface(self.web)
        self.surface.setGeometry(0, 0, 500, 500)
        self.surface.setMouseTracking(True)
        self.buttons=[]
        for y in (30, 130):
            button=QWidget(self.surface);button.setGeometry(0,y,300,80);self.buttons.append(button)
        self.filter=WebPointerCoordinates(self.web)
        app.installEventFilter(self.filter)

    def tearDown(self):
        app.removeEventFilter(self.filter)
        self.window.deleteLater()

    def send(self, actual, stale, kind=QEvent.Type.MouseMove):
        global_pos=self.surface.mapToGlobal(actual)
        button=Qt.MouseButton.NoButton if kind==QEvent.Type.MouseMove else Qt.MouseButton.LeftButton
        event=QMouseEvent(kind,stale,global_pos,button,button,Qt.KeyboardModifier.NoModifier)
        app.sendEvent(self.surface,event)
        return self.surface.received

    def test_offset_move_at_200_percent(self):
        self.assertEqual(self.send(QPointF(100,160),QPointF(100,60)),QPointF(100,160))
        self.assertEqual(self.filter.corrected,1)

    def test_gutter_is_not_snapped_to_a_button(self):
        point=self.send(QPointF(100,120),QPointF(100,60))
        self.assertTrue(all(not b.geometry().contains(point.toPoint()) for b in self.buttons))

    def test_press_and_release_use_same_mapping(self):
        for kind in (QEvent.Type.MouseButtonPress,QEvent.Type.MouseButtonRelease):
            self.assertEqual(self.send(QPointF(100,160),QPointF(100,60),kind),QPointF(100,160))

    def test_correct_position_unchanged(self):
        self.assertEqual(self.send(QPointF(100,160),QPointF(100,160)),QPointF(100,160))
        self.assertEqual(self.filter.corrected,0)

    def test_relocated_view_uses_current_origin(self):
        self.web.move(70,130)
        self.assertEqual(self.send(QPointF(100,160),QPointF(100,60)),QPointF(100,160))

if __name__=='__main__':unittest.main()
