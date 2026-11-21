from __future__ import annotations

import os
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from app.bridge import FileService, read_payload
from app.server import AppServer


class BridgeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_reads_utf8_and_strips_bom(self) -> None:
        target = self.root / "note.md"
        target.write_bytes(b"\xef\xbb\xbf# \xe7\xba\xb8\xe9\x97\xb4")
        payload = read_payload(target)
        self.assertEqual(payload["text"], "# 纸间")
        self.assertEqual(payload["name"], "note.md")
        self.assertGreater(payload["mtimeMs"], 0)

    def test_rejects_binary_files(self) -> None:
        target = self.root / "binary.md"
        target.write_bytes(b"hello\x00world")
        with self.assertRaises(RuntimeError):
            read_payload(target)

    def test_save_creates_and_updates_file(self) -> None:
        service = FileService([])
        target = self.root / "new.md"
        result = service.save_file(
            {"path": str(target), "text": "# 新文档\n", "mtimeMs": None}
        )
        self.assertEqual(result["status"], "saved")
        self.assertEqual(target.read_text(encoding="utf-8"), "# 新文档\n")

        stat = target.stat()
        result = service.save_file(
            {
                "path": str(target),
                "text": "# 更新\n",
                "mtimeMs": stat.st_mtime * 1000,
            }
        )
        self.assertEqual(result["status"], "saved")
        self.assertEqual(target.read_text(encoding="utf-8"), "# 更新\n")

    def test_reports_a_conflict_without_writing(self) -> None:
        service = FileService([])
        target = self.root / "note.md"
        target.write_text("original", encoding="utf-8")
        old = time.time() - 10
        os.utime(target, (old, old))
        result = service.save_file(
            {"path": str(target), "text": "mine", "mtimeMs": old * 1000 - 5000}
        )
        self.assertEqual(result["status"], "conflict")
        self.assertEqual(result["file"]["text"], "original")
        self.assertEqual(target.read_text(encoding="utf-8"), "original")

    def test_preserves_crlf_line_endings(self) -> None:
        service = FileService([])
        target = self.root / "windows.md"
        target.write_bytes(b"# Title\r\n\r\nBody\r\n")
        result = service.save_file(
            {
                "path": str(target),
                "text": "# Title\n\nBody\n",
                "mtimeMs": target.stat().st_mtime * 1000,
            }
        )
        self.assertEqual(result["status"], "saved")
        self.assertEqual(target.read_bytes(), b"# Title\r\n\r\nBody\r\n")

    def test_save_as_uses_dialog_path(self) -> None:
        service = FileService([])
        chosen = self.root / "chosen.md"

        class FakeWindow:
            def create_file_dialog(self, **_kwargs):
                return str(chosen)

        service.set_window(FakeWindow())
        result = service.save_file_as({"suggestedName": "未命名", "text": "hello"})
        self.assertIsNotNone(result)
        self.assertEqual(result["path"], str(chosen.resolve()))
        self.assertEqual(chosen.read_text(encoding="utf-8"), "hello")

    def test_open_files_reports_partial_errors(self) -> None:
        good = self.root / "good.md"
        good.write_text("ok", encoding="utf-8")
        missing = self.root / "missing.md"

        class FakeWindow:
            def create_file_dialog(self, **_kwargs):
                return [str(good), str(missing)]

        service = FileService([])
        service.set_window(FakeWindow())
        result = service.open_files()
        self.assertEqual(len(result["files"]), 1)
        self.assertEqual(len(result["errors"]), 1)


class ServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "index.html").write_text("<title>paperleaf</title>", encoding="utf-8")
        (self.root / "assets").mkdir()
        (self.root / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
        image = self.root / "image.png"
        image.write_bytes(b"\x89PNG\r\n\x1a\n")
        self.image = image
        self.server = AppServer(self.root, port=0)
        self.base = self.server.start()

    def tearDown(self) -> None:
        self.server.stop()
        self.temp.cleanup()

    def test_stop_is_idempotent(self) -> None:
        self.server.stop()
        self.server.stop()

    def test_serves_index_and_assets(self) -> None:
        with urllib.request.urlopen(self.base, timeout=5) as response:
            self.assertIn(b"paperleaf", response.read())
        with urllib.request.urlopen(
            f"{self.base}assets/app.js", timeout=5
        ) as response:
            self.assertEqual(response.headers.get_content_type(), "text/javascript")
            self.assertIn(b"console.log", response.read())

    def test_serves_local_images_only(self) -> None:
        from urllib.parse import quote

        url = f"{self.base}media?path={quote(str(self.image))}"
        with urllib.request.urlopen(url, timeout=5) as response:
            self.assertEqual(response.headers.get_content_type(), "image/png")

        text = self.root / "note.txt"
        text.write_text("not an image", encoding="utf-8")
        bad = f"{self.base}media?path={quote(str(text))}"
        with self.assertRaises(urllib.error.HTTPError):
            urllib.request.urlopen(bad, timeout=5)

    def test_rejects_traversal(self) -> None:
        with self.assertRaises(urllib.error.HTTPError):
            urllib.request.urlopen(f"{self.base}assets/../../secret.txt", timeout=5)


if __name__ == "__main__":
    unittest.main()
