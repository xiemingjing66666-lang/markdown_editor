"""Configure pythonnet before WebView2 starts inside a PyInstaller bundle."""

from __future__ import annotations

import os
import sys

if sys.platform == "win32":
    base = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    exe_dir = os.path.dirname(sys.executable)
    python_dll = f"python{sys.version_info[0]}{sys.version_info[1]}.dll"
    runtime_dir = os.path.join(base, "pythonnet", "runtime")
    webview_lib_dir = os.path.join(base, "webview", "lib")

    os.environ.setdefault("PYTHONNET_RUNTIME", "netfx")

    candidates = [
        os.path.join(base, python_dll),
        os.path.join(exe_dir, python_dll),
    ]
    for root, _dirs, files in os.walk(base):
        if python_dll in files:
            candidates.append(os.path.join(root, python_dll))
            break

    def unblock(path: str) -> None:
        try:
            os.remove(f"{path}:Zone.Identifier")
        except OSError:
            pass

    selected = None
    for candidate in candidates:
        if os.path.isfile(candidate):
            os.environ["PYTHONNET_PYDLL"] = candidate
            unblock(candidate)
            selected = candidate
            break

    runtime_dll = os.path.join(runtime_dir, "Python.Runtime.dll")
    if not os.path.isfile(runtime_dll):
        for root, _dirs, files in os.walk(base):
            if "Python.Runtime.dll" in files:
                runtime_dll = os.path.join(root, "Python.Runtime.dll")
                break
    if os.path.isfile(runtime_dll):
        unblock(runtime_dll)

    search_dirs = []
    for path in (
        base,
        exe_dir,
        runtime_dir if os.path.isdir(runtime_dir) else None,
        os.path.dirname(runtime_dll) if os.path.isfile(runtime_dll) else None,
        os.path.dirname(selected) if selected else None,
        webview_lib_dir if os.path.isdir(webview_lib_dir) else None,
    ):
        if path and os.path.isdir(path) and path not in search_dirs:
            search_dirs.append(path)

    os.environ["PATH"] = os.pathsep.join(
        search_dirs
        + [
            part
            for part in os.environ.get("PATH", "").split(os.pathsep)
            if part and part not in search_dirs
        ]
    )

    handles = []
    if hasattr(os, "add_dll_directory"):
        for path in search_dirs:
            try:
                handles.append(os.add_dll_directory(path))
            except OSError:
                pass
