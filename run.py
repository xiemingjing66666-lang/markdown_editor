"""PyInstaller entry point (package-relative imports need a real module)."""

import ctypes
import multiprocessing
import sys
import traceback

from bootstrap import prepare

prepare()

from app.main import main  # noqa: E402

if __name__ == "__main__":
    multiprocessing.freeze_support()
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001 - last-resort visible failure
        if getattr(sys, "frozen", False):
            details = traceback.format_exc()
            ctypes.windll.user32.MessageBoxW(
                0,
                f"纸间无法启动：\n{error}\n\n{details[-1200:]}",
                "纸间",
                0x10,
            )
        raise
