"""Register Zhijian as an option for Markdown files on Windows.

Windows 10/11 protects the final default-app choice inside UserChoice, so the
app registers a ProgID and then lets the user confirm through the native
"Open with" dialog. Nothing here writes outside HKEY_CURRENT_USER.
"""

from __future__ import annotations

import ctypes
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

import winreg

PROG_ID = "Zhijian.md"
FRIENDLY_NAME = "纸间"
EXTENSIONS = (".md", ".markdown")
OAIF_ALLOW_REGISTRATION = 0x1
OAIF_FORCE_REGISTRATION = 0x8
SHCNE_ASSOCCHANGED = 0x08000000


class OPENASINFO(ctypes.Structure):
    _fields_ = [
        ("pcszFile", ctypes.c_wchar_p),
        ("pcszClass", ctypes.c_wchar_p),
        ("oaifInFlags", ctypes.c_uint),
    ]


def _executable() -> Path:
    return Path(sys.executable)


def _open_command() -> str:
    executable = _executable()
    if getattr(sys, "frozen", False):
        return f'"{executable}" "%1"'
    launcher = Path(__file__).resolve().parent.parent / "run.py"
    return f'"{executable}" "{launcher}" "%1"'


def _notify_shell() -> None:
    try:
        ctypes.windll.shell32.SHChangeNotify(SHCNE_ASSOCCHANGED, 0, None, None)
    except OSError:
        pass


def _set(path: str, name: str, value: str = "", kind: int = winreg.REG_SZ) -> None:
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_WRITE) as key:
        winreg.SetValueEx(key, name, 0, kind, value)


def _current_default(extension: str) -> str:
    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, rf"Software\Classes\{extension}"
        ) as key:
            value, _ = winreg.QueryValueEx(key, "")
            return str(value)
    except OSError:
        return ""


def register() -> dict[str, Any]:
    command = _open_command()
    _set(rf"Software\Classes\{PROG_ID}", "", "Markdown 文档")
    _set(rf"Software\Classes\{PROG_ID}\DefaultIcon", "", f'"{_executable()}",0')
    _set(rf"Software\Classes\{PROG_ID}\shell\open\command", "", command)
    _set(rf"Software\Classes\{PROG_ID}\Application", "", _executable().name)

    app_key = rf"Software\Classes\Applications\{_executable().name}"
    _set(app_key, "FriendlyAppName", FRIENDLY_NAME)
    _set(rf"{app_key}\shell\open\command", "", command)
    for extension in EXTENSIONS:
        _set(rf"{app_key}\SupportedTypes", extension, "")

    for extension in EXTENSIONS:
        _set(
            rf"Software\Classes\{extension}\OpenWithProgids",
            PROG_ID,
            b"",
            winreg.REG_NONE,
        )
        if not _current_default(extension):
            _set(rf"Software\Classes\{extension}", "", PROG_ID)

    _notify_shell()
    return {
        "registered": True,
        "progId": PROG_ID,
        "command": command,
        "executable": str(_executable()),
    }


def _open_with_dialog() -> bool:
    temporary: Path | None = None
    try:
        handle, name = tempfile.mkstemp(suffix=".md", prefix="zhijian-association-")
        os.close(handle)
        temporary = Path(name)
        temporary.write_text("# 纸间\n", encoding="utf-8")
        info = OPENASINFO(
            str(temporary),
            None,
            OAIF_ALLOW_REGISTRATION | OAIF_FORCE_REGISTRATION,
        )
        shell32 = ctypes.windll.shell32
        shell32.SHOpenWithDialog.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(OPENASINFO),
        ]
        shell32.SHOpenWithDialog.restype = ctypes.c_long
        result = shell32.SHOpenWithDialog(None, ctypes.byref(info))
        return result == 0
    except (OSError, AttributeError):
        return False
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def open_default_apps_settings() -> bool:
    try:
        os.startfile("ms-settings:defaultapps")
        return True
    except OSError:
        return False


def register_and_prompt() -> dict[str, Any]:
    registration = register()
    dialog_opened = _open_with_dialog()
    settings_opened = False
    if not dialog_opened:
        settings_opened = open_default_apps_settings()
    return {
        **registration,
        "dialogOpened": dialog_opened,
        "settingsOpened": settings_opened,
    }
