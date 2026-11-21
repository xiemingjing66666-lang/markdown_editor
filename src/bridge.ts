import type {
  FilePayload,
  MarkdownAssociationResult,
  OpenDialogResult,
  SaveResult,
  WindowRect,
  ZhijianBridge,
} from "./types/bridge";

interface PywebviewApi {
  open_files: () => Promise<OpenDialogResult>;
  read_file: (path: string) => Promise<FilePayload>;
  save_file: (input: {
    path: string;
    text: string;
    mtimeMs: number | null;
  }) => Promise<SaveResult>;
  save_file_as: (input: {
    suggestedName: string;
    text: string;
  }) => Promise<FilePayload | null>;
  reveal_file: (path: string) => Promise<void>;
  open_external: (url: string) => Promise<void>;
  get_launch_files: () => Promise<string[]>;
  set_markdown_association: () => Promise<MarkdownAssociationResult>;
  window_action: (action: string) => Promise<void>;
  is_maximized: () => Promise<boolean>;
  get_window_rect: () => Promise<WindowRect>;
  move_window_to: (x: number, y: number) => Promise<void>;
  set_window_bounds: (
    x: number,
    y: number,
    width: number,
    height: number,
  ) => Promise<void>;
}

interface PywebviewWindow {
  api: PywebviewApi;
}

declare global {
  interface Window {
    pywebview?: PywebviewWindow;
    __zhijianOpenPaths?: (paths: string[]) => void;
  }
}

function waitForPywebview(): Promise<PywebviewApi> {
  return new Promise((resolve, reject) => {
    if (window.pywebview?.api) {
      resolve(window.pywebview.api);
      return;
    }
    let settled = false;
    const ready = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (window.pywebview?.api) resolve(window.pywebview.api);
      else reject(new Error("桌面桥接未就绪"));
    };
    const timer = window.setTimeout(ready, 5000);
    window.addEventListener("pywebviewready", ready, { once: true });
  });
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  if (error && typeof error === "object" && "message" in error) {
    return new Error(String((error as { message: unknown }).message));
  }
  return new Error(String(error));
}

async function call<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    throw normalizeError(error);
  }
}

function makeBridge(api: PywebviewApi): ZhijianBridge {
  return {
    platform: /Windows/i.test(navigator.userAgent) ? "win32" : "other",
    openFiles: () => call(api.open_files()),
    readFile: (path) => call(api.read_file(path)),
    saveFile: (input) => call(api.save_file(input)),
    saveFileAs: (input) => call(api.save_file_as(input)),
    revealFile: (path) => call(api.reveal_file(path)),
    openExternal: (url) => call(api.open_external(url)),
    getPathForFile: () => "",
    getLaunchFiles: () => call(api.get_launch_files()),
    setMarkdownAssociation: () => call(api.set_markdown_association()),
    onOpenPaths: (callback) => {
      window.__zhijianOpenPaths = callback;
      return () => {
        if (window.__zhijianOpenPaths === callback) {
          delete window.__zhijianOpenPaths;
        }
      };
    },
    getWindowRect: () => call(api.get_window_rect()),
    moveWindowTo: (x, y) => call(api.move_window_to(x, y)),
    setWindowBounds: (rect) =>
      call(
        api.set_window_bounds(rect.x, rect.y, rect.width, rect.height),
      ),
    window: {
      minimize: () => void call(api.window_action("minimize")),
      toggleMaximize: () => void call(api.window_action("toggle-maximize")),
      close: () => void call(api.window_action("close")),
      isMaximized: () => call(api.is_maximized()),
      onMaximized: (callback) => {
        let stopped = false;
        let last = false;
        const tick = async () => {
          if (stopped) return;
          try {
            const maximized = await api.is_maximized();
            if (maximized !== last) {
              last = maximized;
              callback(maximized);
            }
          } catch {
            /* The window can close while a poll is in flight. */
          }
          if (!stopped) window.setTimeout(tick, 350);
        };
        void tick();
        return () => {
          stopped = true;
        };
      },
    },
  };
}

export async function resolveBridge(): Promise<ZhijianBridge> {
  if (window.zhijian) return window.zhijian;
  const api = await waitForPywebview();
  const bridge = makeBridge(api);
  window.zhijian = bridge;
  return bridge;
}
