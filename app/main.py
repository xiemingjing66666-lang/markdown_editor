"""Paperleaf desktop entry point: a small native shell around a static UI."""

from __future__ import annotations

import os
import sys
import threading
import time
from pathlib import Path

import webview

from .bridge import FileService
from .server import AppServer
from .window_utils import capture_window, is_maximized

APP_NAME = "纸间"
MARKDOWN_EXTENSIONS = {".md", ".markdown", ".mdown", ".mdx", ".txt"}


def app_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parent.parent


def data_dir() -> Path:
    base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    target = base / "Zhijian"
    target.mkdir(parents=True, exist_ok=True)
    return target


def storage_dir() -> Path:
    override = os.environ.get("ZHIJIAN_STORAGE")
    if override:
        target = Path(override).resolve()
    else:
        target = data_dir() / "webview"
    target.mkdir(parents=True, exist_ok=True)
    return target


def parse_launch_files(argv: list[str]) -> list[str]:
    files: list[str] = []
    for value in argv:
        if not value or value.startswith("-"):
            continue
        path = Path(value)
        try:
            if path.is_file() and path.suffix.lower() in MARKDOWN_EXTENSIONS:
                files.append(str(path.resolve()))
        except OSError:
            continue
    return list(dict.fromkeys(files))


def background_color() -> str:
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
        ) as key:
            light, _ = winreg.QueryValueEx(key, "AppsUseLightTheme")
            return "#f4f1ea" if light else "#1a1916"
    except OSError:
        return "#f4f1ea"


class Api:
    def __init__(self, service: FileService) -> None:
        self._service = service
        self._window: webview.Window | None = None

    def set_window(self, window: webview.Window) -> None:
        self._window = window
        self._service.set_window(window)

    def open_files(self):
        return self._service.open_files()

    def read_file(self, path: str):
        return self._service.read_file(path)

    def save_file(self, payload: dict):
        return self._service.save_file(payload)

    def save_file_as(self, payload: dict):
        return self._service.save_file_as(payload)

    def reveal_file(self, path: str) -> None:
        self._service.reveal_file(path)

    def open_external(self, url: str) -> None:
        self._service.open_external(url)

    def get_launch_files(self):
        return self._service.get_launch_files()

    def set_markdown_association(self):
        return self._service.set_markdown_association()

    def window_action(self, action: str) -> None:
        if self._window is None:
            return
        if action == "minimize":
            self._window.minimize()
        elif action == "toggle-maximize":
            if is_maximized(self._window):
                self._window.restore()
            else:
                self._window.maximize()
        elif action == "close":
            self._window.destroy()

    def is_maximized(self) -> bool:
        if self._window is None:
            return False
        return is_maximized(self._window)

    def get_window_rect(self) -> dict[str, int]:
        if self._window is None:
            return {"x": 0, "y": 0, "width": 0, "height": 0}
        return {
            "x": int(self._window.x),
            "y": int(self._window.y),
            "width": int(self._window.width),
            "height": int(self._window.height),
        }

    def move_window_to(self, x: float, y: float) -> None:
        if self._window is not None:
            self._window.move(round(x), round(y))

    def set_window_bounds(self, x: float, y: float, width: float, height: float) -> None:
        if self._window is None:
            return
        self._window.resize(max(700, round(width)), max(440, round(height)))
        self._window.move(round(x), round(y))


def main() -> int:
    launch_files = parse_launch_files(sys.argv[1:])
    root = app_root()
    dist = root / "dist"
    if not (dist / "index.html").is_file():
        raise SystemExit("找不到 dist/index.html，请先运行 npm run build。")

    server = AppServer(dist, port=int(os.environ.get("ZHIJIAN_PORT", "47821")))
    url = server.start()
    service = FileService(launch_files)
    api = Api(service)

    window = webview.create_window(
        APP_NAME,
        url=url,
        width=1140,
        height=720,
        min_size=(700, 440),
        frameless=True,
        easy_drag=False,
        shadow=True,
        resizable=True,
        background_color=background_color(),
        text_select=True,
        zoomable=False,
        js_api=api,
    )
    if window is None:
        server.stop()
        raise SystemExit("无法创建窗口")
    api.set_window(window)
    window.events.closed += server.stop

    capture_path = os.environ.get("ZHIJIAN_CAPTURE")
    if capture_path:
        def capture_later() -> None:
            time.sleep(1.6)
            try:
                capture_window(window, Path(capture_path))
            except Exception as error:  # noqa: BLE001 - dev-only capture
                print(f"capture failed: {error}", file=sys.stderr)
            finally:
                window.destroy()

        window.events.loaded += lambda: threading.Thread(
            target=capture_later, daemon=True
        ).start()

    icon = root / "build" / "icon.ico"
    debug = bool(os.environ.get("ZHIJIAN_DEBUG"))
    webview.start(
        debug=debug,
        private_mode=False,
        storage_path=str(storage_dir()),
        icon=str(icon) if icon.is_file() else None,
    )
    server.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
