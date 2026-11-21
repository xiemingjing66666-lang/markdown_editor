"""Frozen-app bootstrap for non-ASCII install paths.

pythonnet passes Python.Runtime.dll to .NET as UTF-8, while the .NET Framework
host interprets the path in the active code page. A Chinese install path then
fails to resolve the assembly. We expose the bundle through a free ASCII drive
letter with DefineDosDeviceW, so the path string is ASCII while the files stay
exactly where the user installed them.
"""

from __future__ import annotations

import atexit
import ctypes
import os
import sys
from pathlib import Path

_DLL_HANDLES: list[object] = []
_DRIVE: str | None = None

kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
kernel32.DefineDosDeviceW.argtypes = [
    ctypes.c_uint32,
    ctypes.c_wchar_p,
    ctypes.c_wchar_p,
]
kernel32.DefineDosDeviceW.restype = ctypes.c_int
kernel32.GetLogicalDrives.restype = ctypes.c_uint32


def _is_ascii(value: str) -> bool:
    return all(ord(character) < 128 for character in value)


def _unmap() -> None:
    global _DRIVE
    if _DRIVE:
        kernel32.DefineDosDeviceW(2, _DRIVE, None)  # DDD_REMOVE_DEFINITION
        _DRIVE = None


def _map_bundle(bundle: Path) -> str | None:
    global _DRIVE
    bitmask = kernel32.GetLogicalDrives()
    for letter in "WXYZQPONMLKJIHGF":
        drive = f"{letter}:"
        index = ord(letter) - ord("A")
        if bitmask & (1 << index):
            continue
        target = f"\\??\\{bundle}"
        if not kernel32.DefineDosDeviceW(1, drive, target):
            continue
        runtime = Path(f"{drive}\\pythonnet\\runtime\\Python.Runtime.dll")
        python_dll = Path(f"{drive}\\python312.dll")
        if runtime.is_file() and python_dll.is_file():
            _DRIVE = drive
            atexit.register(_unmap)
            return drive
        kernel32.DefineDosDeviceW(2, drive, None)
    return None


def prepare() -> None:
    if sys.platform != "win32" or not getattr(sys, "frozen", False):
        return
    bundle = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    runtime_source = bundle / "pythonnet" / "runtime" / "Python.Runtime.dll"
    if not runtime_source.is_file():
        return
    if _is_ascii(str(bundle)) and _is_ascii(str(runtime_source)):
        return
    drive = _map_bundle(bundle)
    if drive is None:
        print("[bootstrap] no free ASCII drive letter for the .NET runtime", file=sys.stderr)
        return

    os.environ["PYTHONNET_RUNTIME"] = "netfx"
    os.environ["PYTHONNET_PYDLL"] = f"{drive}\\python312.dll"
    search = [f"{drive}\\pythonnet\\runtime", f"{drive}\\"]
    os.environ["PATH"] = os.pathsep.join(
        search
        + [part for part in os.environ.get("PATH", "").split(os.pathsep) if part]
    )
    if hasattr(os, "add_dll_directory"):
        for entry in search:
            try:
                _DLL_HANDLES.append(os.add_dll_directory(entry))
            except OSError:
                pass

    import pythonnet

    pythonnet.__file__ = f"{drive}\\pythonnet\\__init__.py"
