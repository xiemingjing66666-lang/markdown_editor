"""Native file operations for the paperleaf desktop shell."""

from __future__ import annotations

import os
import subprocess
import time
import webbrowser
from pathlib import Path
from typing import Any

MAX_FILE_BYTES = 32 * 1024 * 1024
MARKDOWN_EXTENSIONS = {".md", ".markdown", ".mdown", ".mdx", ".txt"}


def _clean_error(error: BaseException) -> str:
    return str(error) or error.__class__.__name__


def read_payload(path: str | os.PathLike[str]) -> dict[str, Any]:
    target = Path(path)
    if not target.is_file():
        raise RuntimeError("文件不存在")
    stat = target.stat()
    if stat.st_size > MAX_FILE_BYTES:
        raise RuntimeError("文件超过 32 MB，无法打开")
    data = target.read_bytes()
    if b"\x00" in data:
        raise RuntimeError("这看起来不是文本文件")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise RuntimeError("文件不是 UTF-8 编码") from error
    return {
        "path": str(target.resolve()),
        "name": target.name,
        "text": text,
        "mtimeMs": stat.st_mtime * 1000,
        "size": stat.st_size,
    }


def _atomic_write(target: Path, text: str) -> None:
    if target.exists():
        try:
            if b"\r\n" in target.read_bytes()[:65536]:
                text = text.replace("\r\n", "\n").replace("\n", "\r\n")
        except OSError:
            pass
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(
        f".{target.name}.{os.getpid()}.{int(time.time() * 1000)}.tmp"
    )
    try:
        temporary.write_text(text, encoding="utf-8", newline="")
        os.replace(temporary, target)
    finally:
        if temporary.exists():
            temporary.unlink(missing_ok=True)


class FileService:
    def __init__(self, launch_files: list[str]) -> None:
        self.launch_files = launch_files
        self.window: Any = None

    def set_window(self, window: Any) -> None:
        self.window = window

    def open_files(self) -> dict[str, Any]:
        if self.window is None:
            return {"files": [], "errors": []}
        paths = self.window.create_file_dialog(
            dialog_type=_file_dialog_open(),
            allow_multiple=True,
            file_types=(
                "Markdown (*.md;*.markdown;*.mdown;*.mdx;*.txt)",
                "所有文件 (*.*)",
            ),
        )
        files: list[dict[str, Any]] = []
        errors: list[dict[str, str]] = []
        for path in paths or []:
            try:
                files.append(read_payload(path))
            except Exception as error:  # noqa: BLE001 - the UI reports per-file errors
                errors.append({"path": str(path), "message": _clean_error(error)})
        return {"files": files, "errors": errors}

    def read_file(self, path: str) -> dict[str, Any]:
        if not isinstance(path, str):
            raise RuntimeError("无效的文件路径")
        return read_payload(path)

    def save_file(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise RuntimeError("无效的保存参数")
        path = payload.get("path")
        text = payload.get("text")
        if not isinstance(path, str) or not isinstance(text, str):
            raise RuntimeError("无效的保存参数")
        target = Path(path)
        expected = payload.get("mtimeMs")
        current = target.stat() if target.exists() else None
        if (
            current is not None
            and isinstance(expected, (int, float))
            and abs(current.st_mtime * 1000 - expected) > 1
        ):
            fresh = read_payload(target)
            return {"status": "conflict", "file": fresh}
        _atomic_write(target, text)
        stat = target.stat()
        return {
            "status": "saved",
            "file": {
                "path": str(target.resolve()),
                "name": target.name,
                "text": text,
                "mtimeMs": stat.st_mtime * 1000,
                "size": stat.st_size,
            },
        }

    def save_file_as(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        if self.window is None or not isinstance(payload, dict):
            return None
        text = payload.get("text")
        if not isinstance(text, str):
            raise RuntimeError("无效的保存参数")
        suggested = str(payload.get("suggestedName") or "未命名.md")
        suggested = "".join(
            character for character in suggested if character not in '<>:"/\\|?*'
        )
        if not Path(suggested).suffix:
            suggested += ".md"
        chosen = self.window.create_file_dialog(
            dialog_type=_file_dialog_save(),
            save_filename=suggested,
            file_types=("Markdown (*.md;*.markdown)", "所有文件 (*.*)"),
        )
        if not chosen:
            return None
        path = chosen if isinstance(chosen, str) else chosen[0]
        target = Path(path)
        if not target.suffix:
            target = target.with_suffix(".md")
        _atomic_write(target, text)
        stat = target.stat()
        return {
            "path": str(target.resolve()),
            "name": target.name,
            "text": text,
            "mtimeMs": stat.st_mtime * 1000,
            "size": stat.st_size,
        }

    def reveal_file(self, path: str) -> None:
        target = Path(path)
        if target.exists():
            subprocess.Popen(["explorer", "/select,", str(target)])

    def open_external(self, url: str) -> None:
        if isinstance(url, str) and url.lower().startswith(("http://", "https://", "mailto:")):
            webbrowser.open(url)

    def get_launch_files(self) -> list[str]:
        return list(self.launch_files)

    def set_markdown_association(self) -> dict[str, Any]:
        from .association import register_and_prompt

        return register_and_prompt()


def _file_dialog_open() -> Any:
    import webview

    return getattr(webview.FileDialog, "OPEN", 10)


def _file_dialog_save() -> Any:
    import webview

    return getattr(webview.FileDialog, "SAVE", 30)
