"""Compile the Windows installer with Inno Setup."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "installer" / "zhijian.iss"
OUTPUT = ROOT / "release" / "Zhijian-Setup-0.3.2.exe"


def find_iscc() -> Path | None:
    found = shutil.which("ISCC.exe") or shutil.which("iscc")
    if found:
        return Path(found)
    candidates = [
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Inno Setup 6" / "ISCC.exe",
        Path(r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"),
        Path(r"C:\Program Files\Inno Setup 6\ISCC.exe"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def main() -> int:
    if not (ROOT / "release" / "Zhijian" / "Zhijian.exe").is_file():
        print("The portable build is missing; run npm run package first.", file=sys.stderr)
        return 1
    iscc = find_iscc()
    if iscc is None:
        print("Inno Setup 6 is required: https://jrsoftware.org/isdl.php", file=sys.stderr)
        return 1
    subprocess.run([str(iscc), "/Qp", str(SCRIPT)], cwd=ROOT, check=True)
    if not OUTPUT.is_file():
        print(f"expected installer was not created: {OUTPUT}", file=sys.stderr)
        return 1
    launcher = ROOT / "packaging" / "安装纸间.cmd"
    if launcher.is_file():
        shutil.copy2(launcher, ROOT / "release" / "安装纸间.cmd")
    print(f"built {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
