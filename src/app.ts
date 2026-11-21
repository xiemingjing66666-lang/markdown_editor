import {
  activeDoc,
  closeDoc as closeDocPure,
  closePane,
  createEmptyState,
  createUntitled,
  findLeaf,
  firstLeaf,
  focusDoc,
  focusPane,
  focusedLeaf,
  getLeaves,
  isDirty,
  makeDoc,
  markSaved,
  moveTab,
  nextTab,
  setDocText,
  setPaneDoc,
  setPaneMode,
  setRatio,
  splitPane,
  type AppState,
  type Doc,
  type DropSide,
} from "./core/model";
import {
  basename,
  isMarkdownPath,
  samePath,
  suggestedName,
} from "./core/paths";
import {
  hydrateLayout,
  readSession,
  serializeSession,
  writeSession,
} from "./core/session";
import {
  applyPreferences,
  savePreferences,
  type Preferences,
} from "./core/preferences";
import { extractHeadings, type OutlineHeading } from "./core/markdown";
import { Store } from "./core/store";
import { Chrome, type TabDropTarget } from "./ui/chrome";
import { showDialog } from "./ui/dialog";
import { OutlinePanel } from "./ui/outline";
import { PaneLayout } from "./ui/paneLayout";
import { SettingsPanel } from "./ui/settings";
import { showToast } from "./ui/toast";
import { Welcome } from "./ui/welcome";
import type { FilePayload, SaveResult, ZhijianBridge } from "./types/bridge";

interface SaveOptions {
  as?: boolean;
  silent?: boolean;
  force?: boolean;
}

const SAVE_DELAY = 750;

export class App {
  private readonly store = new Store<AppState>(createEmptyState());
  private readonly chrome: Chrome;
  private readonly layout: PaneLayout;
  private readonly welcome: Welcome;
  private readonly workspace: HTMLElement;
  private readonly settings: SettingsPanel;
  private readonly outline: OutlinePanel;
  private readonly saveTimers = new Map<string, number>();
  private readonly saveJobs = new Map<string, Promise<boolean>>();
  private readonly conflictDocs = new Set<string>();
  private readonly notifiedErrors = new Set<string>();
  private readonly conflictDialogs = new Set<string>();
  private renderQueued = false;
  private persistTimer = 0;
  private autoSaveEnabled = false;
  private opening = false;
  private closing = false;
  private dialogOpen = false;
  private outlineOpen = false;
  private outlineTimer = 0;
  private outlineDocId: string | null = null;
  private outlineText = "";

  constructor(
    private readonly bridge: ZhijianBridge,
    private preferences: Preferences,
  ) {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) throw new Error("Missing #app");
    root.classList.add("app");

    this.chrome = new Chrome({
      onNew: () => this.newDoc(),
      onOpen: () => void this.openDialog(),
      onSelectDoc: (docId) => this.selectDoc(docId),
      onCloseDoc: (docId) => void this.closeDoc(docId),
      onToggleMode: () => this.toggleMode(),
      onSplit: (side) => this.splitActive(side),
      onMerge: () => this.mergePane(),
      onSaveDoc: (docId) => void this.saveDoc(docId),
      onSaveDocAs: (docId) => void this.saveDoc(docId, { as: true }),
      onRevealDoc: (docId) => this.revealDoc(docId),
      onSettings: (anchor) => this.settings.open(anchor, this.preferences),
      onToggleOutline: () => this.toggleOutline(),
      onTabDrop: (docId, target) => this.handleTabDrop(docId, target),
    });

    this.workspace = document.createElement("main");
    this.workspace.className = "workspace";
    this.workspace.dataset.testid = "workspace";

    const paneHost = document.createElement("div");
    paneHost.className = "pane-host";
    const paneArea = document.createElement("div");
    paneArea.className = "pane-area";
    paneArea.append(paneHost);

    this.layout = new PaneLayout(paneHost, {
      onFocusPane: (paneId) => this.focusPane(paneId),
      onTextChange: (docId, text) => this.changeText(docId, text),
      onOpenLocal: (filePath) => void this.openLocal(filePath),
      onOpenExternal: (url) => void this.bridge.openExternal(url),
      onRatioChange: (splitId, ratio) =>
        this.setState(setRatio(this.store.getState(), splitId, ratio)),
    });

    this.welcome = new Welcome({
      onNew: () => this.newDoc(),
      onOpen: () => void this.openDialog(),
    });
    this.settings = new SettingsPanel({
      onChange: (next) => this.updatePreferences(next),
      onSetDefault: () => void this.setDefaultApp(),
    });
    this.outline = new OutlinePanel((heading) => this.jumpToHeading(heading));
    paneArea.append(this.welcome.element);
    this.workspace.append(this.outline.element, paneArea);
    root.append(this.chrome.element, this.workspace);

    this.store.subscribe((state, previous) => {
      this.onStateChanged(state, previous);
      this.scheduleRender();
    });

    this.bindBridge();
    this.bindKeyboard();
    this.bindFileDrop();
    window.__zhijianPersist = () => this.persistNow();
    window.addEventListener("beforeunload", () => this.persistNow());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.persistNow();
    });
  }

  async start(): Promise<void> {
    this.mountInitial();
    const restored = await this.restore();
    this.setState(restored);
    this.autoSaveEnabled = true;
    this.renderNow();

    const launch = await this.bridge.getLaunchFiles();
    if (launch.length) await this.openPaths(launch);
  }

  private mountInitial(): void {
    this.chrome.render(this.store.getState());
    this.layout.update(this.store.getState());
    this.welcome.setVisible(true);
    this.workspace.classList.add("is-empty");
  }

  private onStateChanged(state: AppState, previous: AppState): void {
    if (this.autoSaveEnabled) this.scheduleAutosave(state, previous);
    this.schedulePersist();
  }

  private scheduleRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.renderNow();
    });
  }

  private renderNow(): void {
    const state = this.store.getState();
    this.chrome.render(state);
    const active = activeDoc(state);
    const showOutline = this.outlineOpen && Boolean(active);
    this.workspace.classList.toggle("has-outline", showOutline);
    this.outline.setVisible(showOutline);
    this.chrome.setOutlineOpen(this.outlineOpen);
    this.welcome.setVisible(state.tabs.length === 0);
    this.workspace.classList.toggle("is-empty", state.tabs.length === 0);
    if (state.tabs.length > 0) this.layout.update(state);
    if (showOutline && active) {
      this.scheduleOutline(active);
    } else {
      window.clearTimeout(this.outlineTimer);
      this.outlineTimer = 0;
    }
  }

  private setState(next: AppState): void {
    this.store.setState(next);
  }

  private newDoc(): void {
    const state = this.store.getState();
    const { state: withDoc } = createUntitled(state);
    const leaf = focusedLeaf(withDoc);
    const next = setPaneMode(withDoc, leaf.id, "write");
    this.setState(next);
    this.focusEditorAfterRender(leaf.id);
  }

  private async openDialog(): Promise<void> {
    if (this.opening) return;
    this.opening = true;
    try {
      const result = await this.bridge.openFiles();
      for (const error of result.errors) {
        showToast(`${basename(error.path)}：${cleanError(error.message)}`, "error");
      }
      if (result.files.length) this.openPayloads(result.files);
    } catch (error) {
      showToast(cleanError(errorMessage(error)), "error");
    } finally {
      this.opening = false;
    }
  }

  private openPayloads(payloads: FilePayload[]): void {
    if (!payloads.length) return;
    const state = this.store.getState();
    const docs = { ...state.docs };
    const tabs = [...state.tabs];
    let firstId: string | null = null;
    let firstWasExisting = false;

    for (const payload of payloads) {
      const existing = Object.values(docs).find(
        (doc) => doc.path && samePath(doc.path, payload.path),
      );
      if (existing) {
        firstId ??= existing.id;
        firstWasExisting = firstId === existing.id;
        continue;
      }
      const doc = makeDoc({
        path: payload.path,
        name: payload.name,
        text: payload.text,
        mtimeMs: payload.mtimeMs,
      });
      docs[doc.id] = doc;
      tabs.push(doc.id);
      firstId ??= doc.id;
    }

    if (!firstId) return;

    const next = firstWasExisting
      ? focusDoc({ ...state, docs, tabs }, firstId)
      : setPaneDoc({ ...state, docs, tabs }, state.focusedPaneId, firstId);
    this.setState(next);
    this.focusEditorAfterRender(next.focusedPaneId);
  }

  private async openPaths(paths: string[]): Promise<void> {
    if (!paths.length) return;
    const payloads: FilePayload[] = [];
    for (const filePath of paths) {
      try {
        payloads.push(await this.bridge.readFile(filePath));
      } catch (error) {
        showToast(`${basename(filePath)}：${cleanError(errorMessage(error))}`, "error");
      }
    }
    this.openPayloads(payloads);
  }

  private async openLocal(filePath: string): Promise<void> {
    if (!isMarkdownPath(filePath)) {
      showToast("只能打开 Markdown 文件", "error");
      return;
    }
    await this.openPaths([filePath]);
  }

  private async openDroppedFiles(files: File[]): Promise<void> {
    const entries: Array<{ name: string; text: string }> = [];
    for (const file of files) {
      if (!isMarkdownPath(file.name)) {
        showToast(`${file.name}：不是 Markdown 文件`, "error");
        continue;
      }
      if (file.size > 32 * 1024 * 1024) {
        showToast(`${file.name}：文件超过 32 MB`, "error");
        continue;
      }
      try {
        entries.push({ name: file.name || "未命名.md", text: await file.text() });
      } catch {
        showToast(`${file.name}：无法读取`, "error");
      }
    }
    if (!entries.length) return;
    const state = this.store.getState();
    const docs = { ...state.docs };
    const tabs = [...state.tabs];
    let firstId: string | null = null;
    for (const entry of entries) {
      const doc = makeDoc({ name: entry.name, text: entry.text });
      doc.savedText = "";
      docs[doc.id] = doc;
      tabs.push(doc.id);
      firstId ??= doc.id;
    }
    if (!firstId) return;
    const next = setPaneDoc(
      { ...state, docs, tabs },
      state.focusedPaneId,
      firstId,
    );
    this.setState(next);
    this.focusEditorAfterRender(next.focusedPaneId);
  }

  private selectDoc(docId: string): void {
    const state = this.store.getState();
    const next = focusDoc(state, docId);
    this.setState(next);
    const leaf = focusedLeaf(next);
    if (leaf.mode === "write") this.focusEditorAfterRender(leaf.id);
  }

  private changeText(docId: string, text: string): void {
    this.notifiedErrors.delete(docId);
    this.setState(setDocText(this.store.getState(), docId, text));
  }

  private toggleMode(): void {
    const state = this.store.getState();
    const leaf = focusedLeaf(state);
    if (!leaf.docId) return;
    const mode = leaf.mode === "write" ? "read" : "write";
    const next = setPaneMode(state, leaf.id, mode);
    this.setState(next);
    if (mode === "write") this.focusEditorAfterRender(leaf.id);
  }

  private toggleOutline(): void {
    const state = this.store.getState();
    if (!activeDoc(state)) return;
    this.outlineOpen = !this.outlineOpen;
    if (this.outlineOpen) {
      this.outlineDocId = null;
      this.outlineText = "";
    }
    this.renderNow();
  }

  private async setDefaultApp(): Promise<void> {
    try {
      const result = await this.bridge.setMarkdownAssociation();
      if (!result.dialogOpened && result.settingsOpened) {
        showToast("在系统设置中选择纸间");
      }
    } catch (error) {
      showToast(`设置默认程序失败：${cleanError(errorMessage(error))}`, "error");
    }
  }

  private scheduleOutline(doc: Doc): void {
    if (!this.outlineOpen) return;
    if (this.outlineDocId === doc.id && this.outlineText === doc.text) return;
    if (this.outlineDocId !== doc.id) {
      this.outline.setHeadings([]);
      this.outline.setActive(null);
    }
    this.outlineDocId = doc.id;
    this.outlineText = doc.text;
    window.clearTimeout(this.outlineTimer);
    this.outlineTimer = window.setTimeout(() => {
      const current = activeDoc(this.store.getState());
      if (!this.outlineOpen || !current || current.id !== doc.id) return;
      this.outline.setHeadings(extractHeadings(current.text));
    }, 120);
  }

  private jumpToHeading(heading: OutlineHeading): void {
    const state = this.store.getState();
    const doc = activeDoc(state);
    if (!doc || doc.id !== this.outlineDocId) return;
    this.layout.jumpToHeading(focusedLeaf(state).id, heading);
  }

  private splitActive(side: DropSide): void {
    const state = this.store.getState();
    const leaf = focusedLeaf(state);
    if (!leaf.docId) return;
    const next = splitPane(
      state,
      leaf.id,
      side,
      leaf.docId,
      leaf.mode,
    );
    this.setState(next);
    this.focusEditorAfterRender(next.focusedPaneId);
  }

  private mergePane(): void {
    const state = this.store.getState();
    if (getLeaves(state.layout).length <= 1) return;
    const next = closePane(state, state.focusedPaneId);
    this.setState(next);
    this.focusEditorAfterRender(next.focusedPaneId);
  }

  private focusPane(paneId: string): void {
    const state = this.store.getState();
    if (state.focusedPaneId === paneId) return;
    this.setState(focusPane(state, paneId));
  }

  private handleTabDrop(docId: string, target: TabDropTarget): void {
    const state = this.store.getState();
    if (!state.docs[docId]) return;
    if (target.type === "tabs") {
      this.setState(moveTab(state, docId, target.beforeId));
      return;
    }
    const pane = findLeaf(state.layout, target.paneId);
    if (!pane) return;
    if (target.side === "center") {
      this.setState(focusPane(setPaneDoc(state, pane.id, docId), pane.id));
      this.focusEditorAfterRender(pane.id);
      return;
    }
    const mode = state.docs[pane.docId ?? ""] ? pane.mode : "write";
    const next = splitPane(state, pane.id, target.side, docId, mode);
    this.setState(next);
    this.focusEditorAfterRender(next.focusedPaneId);
  }

  private async saveDoc(docId: string, options: SaveOptions = {}): Promise<boolean> {
    this.clearSaveTimer(docId);
    const existing = this.saveJobs.get(docId);
    const job = (existing ?? Promise.resolve(true))
      .catch(() => false)
      .then(() => this.performSave(docId, options));
    this.saveJobs.set(docId, job);
    try {
      return await job;
    } finally {
      if (this.saveJobs.get(docId) === job) this.saveJobs.delete(docId);
    }
  }

  private async performSave(docId: string, options: SaveOptions): Promise<boolean> {
    const state = this.store.getState();
    const doc = state.docs[docId];
    if (!doc) return false;
    if (options.as || !doc.path) {
      if (options.silent) return false;
      return this.performSaveAs(doc, options);
    }
    const text = doc.text;
    let result: SaveResult;
    try {
      result = await this.bridge.saveFile({
        path: doc.path,
        text,
        mtimeMs: options.force ? null : doc.mtimeMs,
      });
    } catch (error) {
      if (!options.silent || !this.notifiedErrors.has(docId)) {
        showToast(`保存失败：${cleanError(errorMessage(error))}`, "error");
        this.notifiedErrors.add(docId);
      }
      return false;
    }
    if (result.status === "conflict") {
      await this.handleConflict(docId, result.file);
      return false;
    }
    this.applySaved(docId, text, result.file);
    return true;
  }

  private async performSaveAs(doc: Doc, _options: SaveOptions): Promise<boolean> {
    try {
      const file = await this.bridge.saveFileAs({
        suggestedName: suggestedName(doc.name),
        text: doc.text,
      });
      if (!file) return false;
      const current = this.store.getState().docs[doc.id];
      if (!current) return false;
      this.applySaved(doc.id, doc.text, file);
      return true;
    } catch (error) {
      showToast(`保存失败：${cleanError(errorMessage(error))}`, "error");
      return false;
    }
  }

  private applySaved(docId: string, savedText: string, file: FilePayload): void {
    const state = this.store.getState();
    const current = state.docs[docId];
    if (!current) return;
    const next: AppState = {
      ...state,
      docs: {
        ...state.docs,
        [docId]: {
          ...current,
          path: file.path,
          name: file.name,
          savedText,
          mtimeMs: file.mtimeMs,
        },
      },
    };
    this.notifiedErrors.delete(docId);
    this.conflictDocs.delete(docId);
    this.setState(next);
  }

  private async handleConflict(docId: string, file: FilePayload): Promise<void> {
    if (this.conflictDialogs.has(docId) || this.dialogOpen) {
      this.conflictDocs.add(docId);
      return;
    }
    this.conflictDialogs.add(docId);
    this.dialogOpen = true;
    this.conflictDocs.add(docId);
    const doc = this.store.getState().docs[docId];
    const name = doc?.name ?? file.name;
    const choice = await showDialog({
      title: `「${name}」已在磁盘上改变`,
      body: "重新载入会放弃当前编辑；仍然保存会覆盖磁盘上的版本。",
      testid: "conflict-dialog",
      onCancel: "cancel",
      actions: [
        { label: "取消", value: "cancel" },
        { label: "仍然保存", value: "overwrite", tone: "danger" },
        { label: "重新载入", value: "reload", tone: "primary" },
      ],
    });
    this.dialogOpen = false;
    this.conflictDialogs.delete(docId);

    if (choice === "reload") {
      try {
        const fresh = await this.bridge.readFile(file.path);
        const state = this.store.getState();
        const current = state.docs[docId];
        if (!current) return;
        const next = markSaved(state, docId, {
          path: fresh.path,
          name: fresh.name,
          text: fresh.text,
          mtimeMs: fresh.mtimeMs,
        });
        this.setState(next);
        this.layout.invalidateDoc(next.docs[docId]!);
        this.conflictDocs.delete(docId);
        showToast("已重新载入");
      } catch (error) {
        showToast(`重新载入失败：${cleanError(errorMessage(error))}`, "error");
      }
      return;
    }
    if (choice === "overwrite") {
      this.conflictDocs.delete(docId);
      const saved = await this.saveDoc(docId, { force: true });
      if (saved) showToast("已保存");
      return;
    }
    this.conflictDocs.add(docId);
  }

  private async closeDoc(docId: string): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    try {
      const state = this.store.getState();
      const doc = state.docs[docId];
      if (!doc) return;

      if (isDirty(doc)) {
        if (doc.path) {
          const saved = await this.saveDoc(docId);
          if (!saved) return;
        } else {
          const choice = await showDialog({
            title: `保存「${doc.name}」？`,
            testid: "unsaved-dialog",
            onCancel: "cancel",
            actions: [
              { label: "取消", value: "cancel" },
              { label: "不保存", value: "discard" },
              { label: "保存", value: "save", tone: "primary" },
            ],
          });
          if (choice === "cancel") return;
          if (choice === "save") {
            const saved = await this.saveDoc(docId, { as: true });
            if (!saved) return;
          }
        }
      }

      const current = this.store.getState();
      if (!current.docs[docId]) return;
      const closed = closeDocPure(current, docId);
      const next = closed.tabs.length === 0 ? createEmptyState() : closed;
      this.clearSaveTimer(docId);
      this.saveJobs.delete(docId);
      this.layout.dropDoc(docId);
      this.setState(next);
      if (next.tabs.length) {
        const leaf = focusedLeaf(next);
        if (leaf.mode === "write") this.focusEditorAfterRender(leaf.id);
      }
    } finally {
      this.closing = false;
    }
  }

  private revealDoc(docId: string): void {
    const doc = this.store.getState().docs[docId];
    if (doc?.path) void this.bridge.revealFile(doc.path);
  }

  private updatePreferences(next: Preferences): void {
    this.preferences = next;
    savePreferences(next);
    applyPreferences(next);
    this.settings.setPreferences(next);
    this.layout.remeasure();
    if (next.autosave) this.scheduleAllAutosaves();
    else this.clearAllSaveTimers();
  }

  private scheduleAllAutosaves(): void {
    const state = this.store.getState();
    for (const doc of Object.values(state.docs)) {
      if (doc.path && isDirty(doc) && !this.conflictDocs.has(doc.id)) {
        this.armAutosave(doc.id, 300);
      }
    }
  }

  private armAutosave(docId: string, delay: number): void {
    this.clearSaveTimer(docId);
    const timer = window.setTimeout(() => {
      this.saveTimers.delete(docId);
      if (!this.preferences.autosave) return;
      const latest = this.store.getState().docs[docId];
      if (latest && latest.path && isDirty(latest)) {
        void this.saveDoc(docId, { silent: true });
      }
    }, delay);
    this.saveTimers.set(docId, timer);
  }

  private clearAllSaveTimers(): void {
    for (const docId of [...this.saveTimers.keys()]) this.clearSaveTimer(docId);
  }

  private scheduleAutosave(state: AppState, previous: AppState): void {
    if (!this.preferences.autosave) {
      this.clearAllSaveTimers();
      return;
    }
    const ids = new Set([...Object.keys(state.docs), ...Object.keys(previous.docs)]);
    for (const docId of ids) {
      const doc = state.docs[docId];
      const before = previous.docs[docId];
      if (!doc) {
        this.clearSaveTimer(docId);
        continue;
      }
      const changed = !before || doc.text !== before.text;
      if (changed) {
        this.notifiedErrors.delete(docId);
      }
      if (!doc.path || !isDirty(doc) || this.conflictDocs.has(docId)) {
        this.clearSaveTimer(docId);
        continue;
      }
      if (changed) this.armAutosave(docId, SAVE_DELAY);
    }
  }

  private clearSaveTimer(docId: string): void {
    const timer = this.saveTimers.get(docId);
    if (timer) {
      window.clearTimeout(timer);
      this.saveTimers.delete(docId);
    }
  }

  private focusEditorAfterRender(paneId: string): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const state = this.store.getState();
        const leaf = findLeaf(state.layout, paneId);
        if (leaf?.mode === "write") this.layout.focusEditor(paneId);
      });
    });
  }

  private schedulePersist(): void {
    if (!this.autoSaveEnabled) return;
    window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => this.persistNow(), 350);
  }

  private persistNow(): void {
    window.clearTimeout(this.persistTimer);
    try {
      writeSession(serializeSession(this.store.getState()));
    } catch {
      /* Session persistence is best-effort; editing must stay usable. */
    }
  }

  private async restore(): Promise<AppState> {
    const session = readSession();
    if (!session) return createEmptyState();
    const docs: Record<string, Doc> = {};
    let failures = 0;

    await Promise.all(
      session.docs.map(async (entry) => {
        if (entry.path) {
          try {
            const file = await this.bridge.readFile(entry.path);
            docs[entry.id] = {
              id: entry.id,
              path: file.path,
              name: file.name,
              text: entry.draft ?? file.text,
              savedText: file.text,
              mtimeMs: file.mtimeMs,
            };
          } catch {
            failures += 1;
          }
        } else {
          docs[entry.id] = {
            id: entry.id,
            path: null,
            name: entry.name,
            text: entry.draft ?? "",
            savedText: "",
            mtimeMs: null,
          };
        }
      }),
    );

    const tabs = session.tabs.filter((id) => docs[id]);
    if (!tabs.length) {
      if (failures) showToast(`${failures} 个文件无法打开`, "error");
      return createEmptyState();
    }
    const layout = hydrateLayout(session.layout, docs);
    const focusedPaneId = findLeaf(layout, session.focusedPaneId)
      ? session.focusedPaneId
      : firstLeaf(layout).id;
    let state: AppState = {
      docs,
      tabs,
      layout,
      focusedPaneId,
      untitledSeq: Number.isFinite(session.untitledSeq) ? session.untitledSeq : 0,
    };
    // A file that vanished from disk leaves its pane empty; fill it with a tab
    // that still exists instead of showing a dead pane after restore.
    for (const leaf of getLeaves(state.layout)) {
      if (!leaf.docId) state = setPaneDoc(state, leaf.id, tabs[0] ?? null);
    }
    if (!focusedLeaf(state).docId) {
      const filled = getLeaves(state.layout).find((leaf) => leaf.docId);
      if (filled) state = focusPane(state, filled.id);
    }
    if (failures) showToast(`${failures} 个文件无法打开`, "error");
    return state;
  }

  private bindBridge(): void {
    this.bridge.onOpenPaths((paths) => {
      void this.openPaths(paths);
    });
  }

  private bindKeyboard(): void {
    window.addEventListener(
      "keydown",
      (event) => {
        const mod = event.ctrlKey || event.metaKey;
        if (!mod) return;
        const key = event.key.toLowerCase();
        if (event.shiftKey && key === "s") {
          event.preventDefault();
          const doc = activeDoc(this.store.getState());
          if (doc) void this.saveDoc(doc.id, { as: true });
          return;
        }
        if (key === "s") {
          event.preventDefault();
          const doc = activeDoc(this.store.getState());
          if (doc) void this.saveDoc(doc.id);
          return;
        }
        if (key === "n") {
          event.preventDefault();
          this.newDoc();
          return;
        }
        if (key === "o") {
          event.preventDefault();
          if (event.shiftKey) {
            this.toggleOutline();
          } else {
            void this.openDialog();
          }
          return;
        }
        if (key === "w") {
          event.preventDefault();
          if (event.shiftKey) {
            this.mergePane();
          } else {
            const doc = activeDoc(this.store.getState());
            if (doc) void this.closeDoc(doc.id);
          }
          return;
        }
        if (key === "e") {
          event.preventDefault();
          this.toggleMode();
          return;
        }
        if (key === "tab") {
          event.preventDefault();
          const state = this.store.getState();
          const id = nextTab(state, event.shiftKey ? -1 : 1);
          if (id) this.selectDoc(id);
          return;
        }
        if (/^[1-9]$/.test(key)) {
          event.preventDefault();
          const state = this.store.getState();
          const id = state.tabs[Number(key) - 1];
          if (id) this.selectDoc(id);
        }
      },
      true,
    );
  }

  private bindFileDrop(): void {
    const overlay = document.createElement("div");
    overlay.className = "file-drop";
    overlay.innerHTML = `<div class="file-drop-inner"><span class="file-drop-mark">纸</span><span>打开文件</span></div>`;
    document.body.append(overlay);

    let depth = 0;
    const hideDrop = () => {
      depth = 0;
      overlay.classList.remove("is-visible");
    };
    window.addEventListener("dragenter", (event) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      depth += 1;
      overlay.classList.add("is-visible");
    });
    window.addEventListener("dragover", (event) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    });
    window.addEventListener("dragleave", (event) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0 || !event.relatedTarget) hideDrop();
    });
    window.addEventListener("dragend", hideDrop);
    window.addEventListener("blur", hideDrop);
    window.addEventListener("drop", (event) => {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      hideDrop();
      const files = [...event.dataTransfer.files];
      const paths: string[] = [];
      for (const file of files) {
        try {
          const filePath = this.bridge.getPathForFile(file);
          if (filePath) paths.push(filePath);
        } catch {
          /* WebView2 does not expose paths for dropped files. */
        }
      }
      if (paths.length) void this.openPaths(paths);
      else void this.openDroppedFiles(files);
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cleanError(message: string): string {
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "");
}
