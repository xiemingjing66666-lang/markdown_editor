"""A tiny localhost server for the UI and local Markdown images."""

from __future__ import annotations

import mimetypes
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".avif",
    ".bmp",
}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".ogv", ".ogg", ".mov", ".m4v"}
MEDIA_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS


class AppServer:
    def __init__(self, dist_dir: Path, port: int = 47821) -> None:
        self.dist_dir = dist_dir.resolve()
        self.port = port
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> str:
        handler = self._make_handler()
        try:
            self._server = ThreadingHTTPServer(("127.0.0.1", self.port), handler)
        except OSError:
            self._server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self._server.daemon_threads = True
        self.port = self._server.server_address[1]
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return f"http://127.0.0.1:{self.port}/"

    def stop(self) -> None:
        server = self._server
        if server is None:
            return
        self._server = None
        server.shutdown()
        server.server_close()

    def _make_handler(self) -> type[BaseHTTPRequestHandler]:
        root = self.dist_dir

        class Handler(BaseHTTPRequestHandler):
            server_version = "Zhijian"

            def log_message(self, format: str, *args: object) -> None:  # noqa: A002
                return

            def do_GET(self) -> None:  # noqa: N802
                parsed = urlparse(self.path)
                if parsed.path == "/favicon.ico":
                    self.send_response(204)
                    self.end_headers()
                    return
                if parsed.path == "/media":
                    self._serve_media(parsed.query)
                    return
                self._serve_static(parsed.path)

            def do_HEAD(self) -> None:  # noqa: N802
                parsed = urlparse(self.path)
                if parsed.path == "/favicon.ico":
                    self.send_response(204)
                    self.end_headers()
                    return
                if parsed.path == "/media":
                    self._serve_media(parsed.query, head_only=True)
                    return
                self._serve_static(parsed.path, head_only=True)

            def _serve_media(self, query: str, head_only: bool = False) -> None:
                raw = parse_qs(query).get("path", [""])[0]
                if not raw:
                    self.send_error(400)
                    return
                try:
                    target = Path(unquote(raw))
                except (ValueError, OSError):
                    self.send_error(400)
                    return
                if (
                    not target.is_absolute()
                    or not target.is_file()
                    or target.suffix.lower() not in MEDIA_EXTENSIONS
                ):
                    self.send_error(404)
                    return
                content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
                size = target.stat().st_size
                start = 0
                end = size - 1
                partial = False
                range_header = self.headers.get("Range", "")
                if range_header.startswith("bytes="):
                    spec = range_header[6:].split(",", 1)[0].strip()
                    first, _, last = spec.partition("-")
                    try:
                        if first:
                            start = int(first)
                            end = int(last) if last else size - 1
                        elif last:
                            length = int(last)
                            start = max(0, size - length)
                            end = size - 1
                        else:
                            raise ValueError
                    except ValueError:
                        self.send_error(416)
                        return
                    if start < 0 or start >= size or end < start:
                        self.send_error(416)
                        return
                    end = min(end, size - 1)
                    partial = True
                length = end - start + 1 if partial else size
                self.send_response(206 if partial else 200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(length))
                self.send_header("Accept-Ranges", "bytes")
                if partial:
                    self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                self.send_header("Cache-Control", "private, max-age=300")
                self.end_headers()
                if head_only:
                    return
                try:
                    with target.open("rb") as file:
                        if start:
                            file.seek(start)
                        remaining = length
                        while remaining > 0:
                            chunk = file.read(min(64 * 1024, remaining))
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                            remaining -= len(chunk)
                except (BrokenPipeError, ConnectionResetError, OSError):
                    return

            def _serve_static(self, url_path: str, head_only: bool = False) -> None:
                relative = unquote(url_path).lstrip("/") or "index.html"
                target = (root / relative).resolve()
                try:
                    target.relative_to(root)
                except ValueError:
                    self.send_error(403)
                    return
                if target.is_dir():
                    target = target / "index.html"
                if not target.is_file():
                    self.send_error(404)
                    return
                content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
                if target.suffix == ".js":
                    content_type = "text/javascript; charset=utf-8"
                elif target.suffix == ".css":
                    content_type = "text/css; charset=utf-8"
                elif target.suffix == ".html":
                    content_type = "text/html; charset=utf-8"
                body = target.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                if target.name == "index.html":
                    self.send_header("Cache-Control", "no-cache")
                else:
                    self.send_header("Cache-Control", "public, max-age=3600")
                self.end_headers()
                if not head_only:
                    try:
                        self.wfile.write(body)
                    except (BrokenPipeError, ConnectionResetError):
                        return

        return Handler
