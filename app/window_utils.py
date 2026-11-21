"""Small Win32 helpers for a frameless, native-feeling window."""

from __future__ import annotations

import ctypes
from ctypes import wintypes
from pathlib import Path
from typing import Any

user32 = ctypes.WinDLL("user32", use_last_error=True)

user32.IsZoomed.argtypes = [wintypes.HWND]
user32.IsZoomed.restype = wintypes.BOOL
user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.GetWindowRect.restype = wintypes.BOOL
user32.SetForegroundWindow.argtypes = [wintypes.HWND]
user32.SetForegroundWindow.restype = wintypes.BOOL
user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
user32.ShowWindow.restype = wintypes.BOOL


def handle_of(window: Any) -> int:
    native = window.native
    handle = native.Handle
    if hasattr(handle, "ToInt64"):
        return int(handle.ToInt64())
    return int(handle)


def is_maximized(window: Any) -> bool:
    return bool(user32.IsZoomed(handle_of(window)))
    return bool(user32.IsZoomed(handle_of(window)))


def capture_window(window: Any, destination: Path) -> None:
    """Capture the window for design review; dev-only, never used in normal runs."""
    import time

    from PIL import ImageGrab

    hwnd = handle_of(window)
    native = window.native
    try:
        native.TopMost = True
        native.Activate()
        native.BringToFront()
    except Exception:
        pass
    user32.ShowWindow(hwnd, 9)  # SW_RESTORE
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.8)
    rect = wintypes.RECT()
    if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
        raise RuntimeError("无法读取窗口位置")
    image = ImageGrab.grab(
        bbox=(rect.left, rect.top, rect.right, rect.bottom),
        all_screens=True,
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination)
    try:
        native.TopMost = False
    except Exception:
        pass
