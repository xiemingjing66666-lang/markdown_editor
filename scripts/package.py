"""Build a portable Windows folder and a zip for distribution."""

from __future__ import annotations

import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RELEASE = ROOT / "release"
NAME = "Zhijian"
VERSION = "0.3.2"


def main() -> int:
    if not (ROOT / "dist" / "index.html").is_file():
        print("dist/index.html is missing; run npm run build first.", file=sys.stderr)
        return 1
    if (RELEASE / NAME).exists():
        shutil.rmtree(RELEASE / NAME)
    RELEASE.mkdir(parents=True, exist_ok=True)

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--windowed",
        "--name",
        NAME,
        "--icon",
        str(ROOT / "build" / "icon.ico"),
        "--add-data",
        f"{ROOT / 'dist'};dist",
        "--add-data",
        f"{ROOT / 'build' / 'icon.ico'};build",
        "--collect-all",
        "webview",
        "--collect-submodules",
        "webview",
        "--hidden-import",
        "webview.platforms.winforms",
        "--runtime-hook",
        str(ROOT / "packaging" / "pyi_rth_pythonnet.py"),
        "--distpath",
        str(RELEASE),
        "--workpath",
        str(ROOT / ".tmp" / "pyinstaller"),
        "--specpath",
        str(ROOT / ".tmp"),
        str(ROOT / "run.py"),
    ]
    subprocess.run(command, cwd=ROOT, check=True)

    executable = RELEASE / NAME / f"{NAME}.exe"
    if not executable.is_file():
        print(f"missing executable: {executable}", file=sys.stderr)
        return 1
    (RELEASE / NAME / "version.txt").write_text(VERSION, encoding="ascii")

    for filename, target in (
        ("启动纸间.cmd", RELEASE / "启动纸间.cmd"),
        ("使用说明.txt", RELEASE / "使用说明.txt"),
    ):
        shutil.copy2(ROOT / "packaging" / filename, target)

    archive = RELEASE / f"{NAME}-{VERSION}-win64.zip"
    if archive.exists():
        archive.unlink()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for entry in (NAME, "启动纸间.cmd", "使用说明.txt"):
            source = RELEASE / entry
            if source.is_dir():
                for file in source.rglob("*"):
                    if file.is_file():
                        bundle.write(file, file.relative_to(RELEASE))
            elif source.is_file():
                bundle.write(source, entry)
    print(f"built {executable}")
    print(f"archived {archive}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
