export interface FilePayload {
  path: string;
  name: string;
  text: string;
  mtimeMs: number;
  size: number;
}

export interface OpenDialogResult {
  files: FilePayload[];
  errors: Array<{ path: string; message: string }>;
}

export type SaveResult =
  | { status: "saved"; file: FilePayload }
  | { status: "conflict"; file: FilePayload };

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MarkdownAssociationResult {
  registered: boolean;
  progId: string;
  command: string;
  executable: string;
  dialogOpened: boolean;
  settingsOpened: boolean;
}

export interface ZhijianBridge {
  platform: string;
  openFiles: () => Promise<OpenDialogResult>;
  readFile: (filePath: string) => Promise<FilePayload>;
  saveFile: (input: {
    path: string;
    text: string;
    mtimeMs: number | null;
  }) => Promise<SaveResult>;
  saveFileAs: (input: {
    suggestedName: string;
    text: string;
  }) => Promise<FilePayload | null>;
  revealFile: (filePath: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  getPathForFile: (file: File) => string;
  getLaunchFiles: () => Promise<string[]>;
  setMarkdownAssociation: () => Promise<MarkdownAssociationResult>;
  onOpenPaths: (callback: (paths: string[]) => void) => () => void;
  getWindowRect: () => Promise<WindowRect>;
  moveWindowTo: (x: number, y: number) => Promise<void>;
  setWindowBounds: (rect: WindowRect) => Promise<void>;
  window: {
    minimize: () => void;
    toggleMaximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    onMaximized: (callback: (maximized: boolean) => void) => () => void;
  };
}

declare global {
  interface Window {
    zhijian: ZhijianBridge;
    __zhijianPersist?: () => void;
  }
}
