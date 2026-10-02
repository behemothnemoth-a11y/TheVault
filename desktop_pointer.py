"""Keep WebEngine events in the receiving widget's current coordinate system."""
from PySide6.QtCore import QObject, QEvent, QCoreApplication
from PySide6.QtGui import QMouseEvent
from PySide6.QtWidgets import QWidget


class WebPointerCoordinates(QObject):
    TYPES = {QEvent.Type.MouseMove, QEvent.Type.MouseButtonPress,
             QEvent.Type.MouseButtonRelease, QEvent.Type.MouseButtonDblClick}

    def __init__(self, web):
        super().__init__(web)
        self.web = web
        self.forwarding = False
        self.checked = 0
        self.corrected = 0

    def eventFilter(self, receiver, event):
        if self.forwarding or event.type() not in self.TYPES:
            return False
        if not isinstance(receiver, QWidget) or not (receiver is self.web or self.web.isAncestorOf(receiver)):
            return False
        self.checked += 1
        # Both values are Qt logical pixels. Never multiply by Windows scaling,
        # apply a guessed title-bar offset, or snap a gap to a nearby button.
        position = receiver.mapFromGlobal(event.globalPosition())
        delta = position - event.position()
        if abs(delta.x()) <= .5 and abs(delta.y()) <= .5:
            return False
        corrected = QMouseEvent(event.type(), position,
            receiver.window().mapFromGlobal(event.globalPosition()), event.globalPosition(),
            event.button(), event.buttons(), event.modifiers(), event.pointingDevice())
        corrected.setTimestamp(event.timestamp())
        self.forwarding = True
        try:
            QCoreApplication.sendEvent(receiver, corrected)
            event.setAccepted(corrected.isAccepted())
            self.corrected += 1
        finally:
            self.forwarding = False
        return True
