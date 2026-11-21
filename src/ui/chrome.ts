import type { AppState, Doc, DropSide } from "../core/model";
import type { WindowRect } from "../types/bridge";
import {
  activeDoc,
  focusedLeaf,
  isDirty,
  paneShowingDoc,
  splitCount,
} from "../core/model";
import { icon } from "./icons";
import { openMenu } from "./menu";

export type TabDropTarget =
  | { type: "tabs"; beforeId: string | null }
  | { type: "pane"; paneId: string; side: DropSide | "center" };

export interface ChromeDeps {
  onNew: () => void;
  onOpen: () => void;
  onSelectDoc: (docId: string) => void;
  onCloseDoc: (docId: string) => void;
  onToggleMode: () => void;
  onSplit: (side: DropSide) => void;
  onMerge: () => void;
  onSaveDoc: (docId: string) => void;
  onSaveDocAs: (docId: string) => void;
  onRevealDoc: (docId: string) => void;
  onSettings: (anchor: HTMLElement) => void;
  onToggleOutline: () => void;
  onTabDrop: (docId: string, target: TabDropTarget) => void;
}

interface DragState {
  docId: string;
  startX: number;
  startY: number;
  pointerId: number;
  active: boolean;
  ghost: HTMLElement | null;
  hint: HTMLElement;
  insert: HTMLElement;
  target: TabDropTarget | null;
  cancelled: boolean;
}

export class Chrome {
  readonly element: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly tabRail: HTMLElement;
  private readonly modeButton: HTMLButtonElement;
  private readonly splitButton: HTMLButtonElement;
  private readonly outlineButton: HTMLButtonElement;
  private readonly maxButton: HTMLButtonElement;
  private readonly tabElements = new Map<string, HTMLElement>();
  private state: AppState | null = null;
  private activeId: string | null = null;
  private drag: DragState | null = null;
  private suppressClick = false;
  private windowDrag: {
    startX: number;
    startY: number;
    origin: WindowRect | null;
    pointerId: number;
    capture: Element;
  } | null = null;
  private windowResize: {
    startX: number;
    startY: number;
    edge: string;
    origin: WindowRect | null;
    pointerId: number;
    capture: Element;
  } | null = null;
  private titleLastDown = 0;
  private maximized = false;
  private boundsFrame = 0;
  private pendingBounds: WindowRect | null = null;
  private boundsInFlight = false;
  private moveFrame = 0;
  private pendingMove: { x: number; y: number } | null = null;
  private moveInFlight = false;

  constructor(private readonly deps: ChromeDeps) {
    this.element = document.createElement("header");
    this.element.className = "titlebar";
    this.element.dataset.testid = "titlebar";

    const brand = document.createElement("div");
    brand.className = "brand";
    brand.title = "纸间";
    const seal = document.createElement("span");
    seal.className = "seal";
    seal.textContent = "纸";
    brand.append(seal);

    this.tabRail = document.createElement("div");
    this.tabRail.className = "tab-rail";

    this.tabs = document.createElement("div");
    this.tabs.className = "tabs";
    this.tabs.setAttribute("role", "tablist");
    this.tabs.setAttribute("aria-label", "打开的文档");
    this.tabs.dataset.testid = "tabs";
    this.tabs.addEventListener(
      "wheel",
      (event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        event.preventDefault();
        this.tabs.scrollLeft += event.deltaY;
      },
      { passive: false },
    );

    const newTab = document.createElement("button");
    newTab.type = "button";
    newTab.className = "icon-button new-tab";
    newTab.innerHTML = icon("plus");
    newTab.setAttribute("aria-label", "新建或打开");
    newTab.title = "新建或打开";
    newTab.dataset.testid = "new-tab";
    newTab.addEventListener("click", () => {
      openMenu(
        newTab,
        [
          {
            label: "新建文档",
            shortcut: "Ctrl N",
            icon: icon("file"),
            onSelect: () => this.deps.onNew(),
          },
          {
            label: "打开文件…",
            shortcut: "Ctrl O",
            icon: icon("folder"),
            onSelect: () => this.deps.onOpen(),
          },
        ],
        { align: "start" },
      );
    });

    this.tabRail.append(this.tabs, newTab);

    const tools = document.createElement("div");
    tools.className = "titlebar-tools";

    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "icon-button";
    settingsButton.innerHTML = icon("sliders");
    settingsButton.setAttribute("aria-label", "设置");
    settingsButton.title = "设置";
    settingsButton.dataset.testid = "settings";
    settingsButton.addEventListener("click", () => this.deps.onSettings(settingsButton));

    this.outlineButton = document.createElement("button");
    this.outlineButton.type = "button";
    this.outlineButton.className = "icon-button";
    this.outlineButton.innerHTML = icon("outline");
    this.outlineButton.setAttribute("aria-label", "目录大纲");
    this.outlineButton.title = "目录大纲";
    this.outlineButton.dataset.testid = "outline-toggle";
    this.outlineButton.setAttribute("aria-pressed", "false");
    this.outlineButton.addEventListener("click", () => this.deps.onToggleOutline());

    this.modeButton = document.createElement("button");
    this.modeButton.type = "button";
    this.modeButton.className = "icon-button";
    this.modeButton.dataset.testid = "mode-toggle";
    this.modeButton.addEventListener("click", () => this.deps.onToggleMode());

    this.splitButton = document.createElement("button");
    this.splitButton.type = "button";
    this.splitButton.className = "icon-button";
    this.splitButton.innerHTML = icon("split");
    this.splitButton.setAttribute("aria-label", "拆分窗格");
    this.splitButton.title = "拆分窗格";
    this.splitButton.dataset.testid = "split-menu";
    this.splitButton.addEventListener("click", () => this.openSplitMenu());

    const windowControls = document.createElement("div");
    windowControls.className = "window-controls";

    const minimize = document.createElement("button");
    minimize.type = "button";
    minimize.className = "window-button";
    minimize.innerHTML = icon("minimize");
    minimize.setAttribute("aria-label", "最小化");
    minimize.addEventListener("click", () => window.zhijian.window.minimize());

    this.maxButton = document.createElement("button");
    this.maxButton.type = "button";
    this.maxButton.className = "window-button";
    this.maxButton.innerHTML = icon("maximize");
    this.maxButton.setAttribute("aria-label", "最大化");
    this.maxButton.addEventListener("click", () => window.zhijian.window.toggleMaximize());

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "window-button window-close";
    closeButton.innerHTML = icon("close");
    closeButton.setAttribute("aria-label", "关闭窗口");
    closeButton.addEventListener("click", () => {
      try {
        window.__zhijianPersist?.();
      } catch {
        /* Closing must never depend on session persistence. */
      }
      window.zhijian.window.close();
    });

    windowControls.append(minimize, this.maxButton, closeButton);
    tools.append(
      this.outlineButton,
      settingsButton,
      this.modeButton,
      this.splitButton,
      windowControls,
    );
    this.element.append(brand, this.tabRail, tools);

    window.zhijian.window.onMaximized((maximized) => this.setMaximized(maximized));
    void window.zhijian.window.isMaximized().then((maximized) => this.setMaximized(maximized));
    window.addEventListener("pointermove", (event) => this.onPointerMove(event));
    window.addEventListener("pointerup", (event) => this.onPointerUp(event));
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.drag?.active) this.cancelDrag();
    });

    this.element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (this.isInteractive(event.target)) return;
      if (this.shouldToggleMaximize()) {
        window.zhijian.window.toggleMaximize();
        return;
      }
      event.preventDefault();
      void this.beginWindowDrag(event);
    });

    for (const edge of [
      "top",
      "right",
      "bottom",
      "left",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ]) {
      const handle = document.createElement("div");
      handle.className = "window-resize";
      handle.dataset.edge = edge;
      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.beginWindowResize(event, edge);
      });
      document.body.append(handle);
    }

    const grip = document.createElement("div");
    grip.className = "resize-grip";
    grip.title = "调整窗口大小";
    grip.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      void this.beginWindowResize(event, "bottom-right");
    });
    document.body.append(grip);
  }

  render(state: AppState): void {
    this.state = state;
    const active = activeDoc(state);
    const leaf = focusedLeaf(state);
    this.renderTabs(state, leaf.docId);
    this.renderMode(leaf.mode, Boolean(active));
    this.modeButton.hidden = !active;
    this.splitButton.hidden = !active;
    this.outlineButton.hidden = !active;
    this.splitButton.disabled = !active;
    this.outlineButton.disabled = !active;
    this.splitButton.title = active ? "拆分窗格" : "先打开一个文档";
    document.body.classList.toggle("has-document", Boolean(active));
    document.title = active
      ? `${isDirty(active) ? "• " : ""}${active.name} — 纸间`
      : "纸间";
  }

  setMaximized(maximized: boolean): void {
    this.maximized = maximized;
    document.body.classList.toggle("is-maximized", maximized);
    this.maxButton.innerHTML = maximized ? icon("restore") : icon("maximize");
    this.maxButton.setAttribute("aria-label", maximized ? "还原" : "最大化");
  }

  setOutlineOpen(open: boolean): void {
    this.outlineButton.classList.toggle("is-active", open);
    this.outlineButton.setAttribute("aria-pressed", String(open));
  }

  private renderTabs(state: AppState, activeId: string | null): void {
    const seen = new Set<string>();
    for (const docId of state.tabs) {
      const doc = state.docs[docId];
      if (!doc) continue;
      seen.add(docId);
      let element = this.tabElements.get(docId);
      if (!element) {
        element = this.createTab(doc);
        this.tabElements.set(docId, element);
      }
      const active = docId === activeId;
      const visible = paneShowingDoc(state, docId) !== null;
      element.classList.toggle("is-active", active);
      element.classList.toggle("is-visible", visible && !active);
      element.classList.toggle("is-dirty", isDirty(doc));
      element.setAttribute("aria-selected", String(active));
      element.tabIndex = active ? 0 : -1;
      const name = element.querySelector<HTMLElement>(".tab-name");
      if (name && name.textContent !== doc.name) name.textContent = doc.name;
      element.title = doc.name;
      this.tabs.append(element);
    }

    for (const [docId, element] of this.tabElements) {
      if (!seen.has(docId)) {
        element.remove();
        this.tabElements.delete(docId);
      }
    }

    if (activeId && this.activeId !== activeId) {
      this.activeId = activeId;
      const activeElement = this.tabElements.get(activeId);
      requestAnimationFrame(() =>
        activeElement?.scrollIntoView({ block: "nearest", inline: "nearest" }),
      );
    }
    if (!activeId) this.activeId = null;
  }

  private createTab(doc: Doc): HTMLElement {
    const tab = document.createElement("div");
    tab.className = "tab";
    tab.setAttribute("role", "tab");
    tab.dataset.docId = doc.id;
    tab.dataset.testid = "tab";
    tab.draggable = false;

    const dot = document.createElement("span");
    dot.className = "tab-dot";
    dot.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "tab-name";
    name.textContent = doc.name;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab-close";
    close.innerHTML = icon("close");
    close.setAttribute("aria-label", "关闭标签页");
    close.title = "关闭";
    close.addEventListener("pointerdown", (event) => event.stopPropagation());
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      this.deps.onCloseDoc(doc.id);
    });

    tab.append(dot, name, close);
    tab.addEventListener("click", (event) => {
      if (this.suppressClick) return;
      if ((event.target as Element).closest(".tab-close")) return;
      this.deps.onSelectDoc(doc.id);
    });
    tab.addEventListener("auxclick", (event) => {
      if (event.button === 1) {
        event.preventDefault();
        this.deps.onCloseDoc(doc.id);
      }
    });
    tab.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.openTabMenu(doc, event.clientX, event.clientY);
    });
    tab.addEventListener("keydown", (event) => {
      const tabs = [...this.tabs.querySelectorAll<HTMLElement>(".tab")];
      const index = tabs.indexOf(tab);
      let next: HTMLElement | undefined;
      if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
      else if (event.key === "ArrowLeft") {
        next = tabs[(index - 1 + tabs.length) % tabs.length];
      } else if (event.key === "Home") next = tabs[0];
      else if (event.key === "End") next = tabs[tabs.length - 1];
      else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        this.deps.onCloseDoc(doc.id);
        return;
      }
      if (next?.dataset.docId) {
        event.preventDefault();
        this.deps.onSelectDoc(next.dataset.docId);
        next.focus();
      }
    });
    tab.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if ((event.target as Element).closest(".tab-close")) return;
      this.beginDrag(doc.id, event);
    });
    return tab;
  }

  private renderMode(mode: "write" | "read", enabled: boolean): void {
    this.modeButton.disabled = !enabled;
    const label = mode === "write" ? "阅读视图" : "编辑文档";
    this.modeButton.innerHTML = icon(mode === "write" ? "book" : "pencil");
    this.modeButton.setAttribute("aria-label", label);
    this.modeButton.title = label;
    this.modeButton.classList.toggle("is-active", mode === "read");
  }

  private openSplitMenu(): void {
    const panes = this.state ? splitCount(this.state) : 1;
    openMenu(
      this.splitButton,
      [
        {
          label: "向右拆分",
          icon: icon("split"),
          onSelect: () => this.deps.onSplit("right"),
        },
        {
          label: "向下拆分",
          icon: icon("splitDown"),
          onSelect: () => this.deps.onSplit("bottom"),
        },
        {
          label: "合并窗格",
          icon: icon("merge"),
          separatorBefore: true,
          disabled: panes <= 1,
          onSelect: () => this.deps.onMerge(),
        },
      ],
      { align: "end" },
    );
  }

  private openTabMenu(doc: Doc, x: number, y: number): void {
    const anchor = this.tabElements.get(doc.id);
    if (!anchor) return;
    openMenu(
      anchor,
      [
        {
          label: "保存",
          shortcut: "Ctrl S",
          icon: icon("save"),
          onSelect: () => this.deps.onSaveDoc(doc.id),
        },
        {
          label: "另存为…",
          shortcut: "Ctrl Shift S",
          icon: icon("saveAs"),
          onSelect: () => this.deps.onSaveDocAs(doc.id),
        },
        {
          label: "向右拆分",
          icon: icon("split"),
          separatorBefore: true,
          onSelect: () => this.deps.onSplit("right"),
        },
        {
          label: "向下拆分",
          icon: icon("splitDown"),
          onSelect: () => this.deps.onSplit("bottom"),
        },
        {
          label: "在资源管理器中显示",
          icon: icon("reveal"),
          separatorBefore: true,
          disabled: !doc.path,
          onSelect: () => this.deps.onRevealDoc(doc.id),
        },
        {
          label: "关闭标签页",
          shortcut: "Ctrl W",
          icon: icon("close"),
          danger: true,
          separatorBefore: true,
          onSelect: () => this.deps.onCloseDoc(doc.id),
        },
      ],
      { align: "start" },
    );
    const menu = document.querySelector<HTMLElement>(".menu");
    if (menu) {
      menu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
      menu.style.top = `${Math.min(y + 4, window.innerHeight - 280)}px`;
    }
  }

  private beginDrag(docId: string, event: PointerEvent): void {
    if (this.drag) return;
    const hint = document.createElement("div");
    hint.className = "pane-drop-hint";
    const insert = document.createElement("div");
    insert.className = "tab-insert";
    this.tabs.append(insert);
    this.drag = {
      docId,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
      active: false,
      ghost: null,
      hint,
      insert,
      target: null,
      cancelled: false,
    };
  }

  private onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.cancelled) return;
    if (!drag.active) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distance < 5) return;
      drag.active = true;
      document.body.classList.add("is-dragging-tab");
      const doc = this.state?.docs[drag.docId];
      const ghost = document.createElement("div");
      ghost.className = "tab-drag-ghost";
      ghost.textContent = doc?.name ?? "";
      document.body.append(ghost);
      drag.ghost = ghost;
      document.body.append(drag.hint);
    }
    if (drag.ghost) {
      drag.ghost.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 10}px)`;
    }
    this.updateDragTarget(drag, event.clientX, event.clientY);
  }

  private updateDragTarget(drag: DragState, x: number, y: number): void {
    const railRect = this.tabRail.getBoundingClientRect();
    const inRail =
      x >= railRect.left &&
      x <= railRect.right &&
      y >= railRect.top &&
      y <= railRect.bottom;
    if (inRail) {
      const beforeId = this.insertionTarget(x);
      drag.target = { type: "tabs", beforeId };
      drag.hint.classList.remove("is-visible");
      const rect = this.tabs.getBoundingClientRect();
      drag.insert.style.display = "block";
      drag.insert.style.left = `${Math.round(x - rect.left + this.tabs.scrollLeft)}px`;
      return;
    }

    const element = document.elementFromPoint(x, y);
    const pane = element?.closest<HTMLElement>(".pane");
    drag.insert.style.display = "none";
    if (!pane) {
      drag.target = null;
      drag.hint.classList.remove("is-visible");
      return;
    }
    const paneId = pane.dataset.paneId;
    if (!paneId) return;
    const rect = pane.getBoundingClientRect();
    const edge = Math.min(110, Math.min(rect.width, rect.height) * 0.28);
    const distances = {
      left: x - rect.left,
      right: rect.right - x,
      top: y - rect.top,
      bottom: rect.bottom - y,
    };
    const nearest = (Object.keys(distances) as Array<keyof typeof distances>).reduce(
      (best, key) => (distances[key] < distances[best] ? key : best),
      "left" as keyof typeof distances,
    );
    const side: DropSide | "center" =
      distances[nearest] <= edge ? nearest : "center";
    drag.target = { type: "pane", paneId, side };

    const hint = drag.hint;
    hint.className = "pane-drop-hint is-visible";
    hint.dataset.side = side;
    if (side === "left") {
      Object.assign(hint.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width / 2}px`,
        height: `${rect.height}px`,
      });
    } else if (side === "right") {
      Object.assign(hint.style, {
        left: `${rect.left + rect.width / 2}px`,
        top: `${rect.top}px`,
        width: `${rect.width / 2}px`,
        height: `${rect.height}px`,
      });
    } else if (side === "top") {
      Object.assign(hint.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height / 2}px`,
      });
    } else if (side === "bottom") {
      Object.assign(hint.style, {
        left: `${rect.left}px`,
        top: `${rect.top + rect.height / 2}px`,
        width: `${rect.width}px`,
        height: `${rect.height / 2}px`,
      });
    } else {
      Object.assign(hint.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    }
  }

  private insertionTarget(x: number): string | null {
    const elements = [...this.tabs.querySelectorAll<HTMLElement>(".tab")];
    for (const tab of elements) {
      const rect = tab.getBoundingClientRect();
      if (x < rect.left + rect.width / 2) {
        return tab.dataset.docId ?? null;
      }
    }
    return null;
  }

  private onPointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      this.cleanupDrag();
      return;
    }
    this.suppressClick = true;
    window.setTimeout(() => {
      this.suppressClick = false;
    }, 0);
    const target = drag.target;
    const docId = drag.docId;
    this.cleanupDrag();
    if (target) this.deps.onTabDrop(docId, target);
  }

  private cancelDrag(): void {
    if (!this.drag) return;
    this.drag.cancelled = true;
    this.cleanupDrag();
  }

  private cleanupDrag(): void {
    if (!this.drag) return;
    this.drag.ghost?.remove();
    this.drag.hint.remove();
    this.drag.insert.remove();
    this.drag = null;
    document.body.classList.remove("is-dragging-tab");
  }

  private shouldToggleMaximize(): boolean {
    const now = performance.now();
    if (now - this.titleLastDown < 320) {
      this.titleLastDown = 0;
      return true;
    }
    this.titleLastDown = now;
    return false;
  }

  private async beginWindowDrag(event: PointerEvent): Promise<void> {
    if (this.windowDrag || this.maximized) return;
    this.windowDrag = {
      startX: event.screenX,
      startY: event.screenY,
      origin: null,
      pointerId: event.pointerId,
      capture: this.element,
    };
    try {
      this.element.setPointerCapture(event.pointerId);
    } catch {
      /* pointer capture is best-effort */
    }
    document.body.classList.add("is-window-dragging");
    window.addEventListener("pointermove", this.onWindowDragMove);
    window.addEventListener("pointerup", this.endWindowDrag, { once: true });
    window.addEventListener("pointercancel", this.endWindowDrag, { once: true });
    const origin = await window.zhijian.getWindowRect().catch(() => null);
    if (this.windowDrag) this.windowDrag.origin = origin;
  }

  private readonly onWindowDragMove = (event: PointerEvent): void => {
    const drag = this.windowDrag;
    if (!drag?.origin) return;
    const x = drag.origin.x + (event.screenX - drag.startX);
    const y = drag.origin.y + (event.screenY - drag.startY);
    this.queueMove(x, y);
  };

  private readonly endWindowDrag = (): void => {
    const drag = this.windowDrag;
    this.windowDrag = null;
    if (drag) {
      try {
        drag.capture.releasePointerCapture(drag.pointerId);
      } catch {
        /* capture may already be released */
      }
    }
    document.body.classList.remove("is-window-dragging");
    window.removeEventListener("pointermove", this.onWindowDragMove);
    window.removeEventListener("pointerup", this.endWindowDrag);
    window.removeEventListener("pointercancel", this.endWindowDrag);
  };

  private async beginWindowResize(
    event: PointerEvent,
    edge: string,
  ): Promise<void> {
    if (this.windowResize) return;
    this.windowResize = {
      startX: event.screenX,
      startY: event.screenY,
      edge,
      origin: null,
      pointerId: event.pointerId,
      capture: event.currentTarget as Element,
    };
    try {
      this.windowResize.capture.setPointerCapture(event.pointerId);
    } catch {
      /* pointer capture is best-effort */
    }
    document.body.classList.add("is-window-resizing");
    window.addEventListener("pointermove", this.onWindowResizeMove);
    window.addEventListener("pointerup", this.endWindowResize, { once: true });
    window.addEventListener("pointercancel", this.endWindowResize, { once: true });
    const origin = await window.zhijian.getWindowRect().catch(() => null);
    if (this.windowResize) this.windowResize.origin = origin;
  }

  private readonly onWindowResizeMove = (event: PointerEvent): void => {
    const resize = this.windowResize;
    if (!resize?.origin) return;
    const dx = event.screenX - resize.startX;
    const dy = event.screenY - resize.startY;
    const origin = resize.origin;
    const left = resize.edge.includes("left");
    const right = resize.edge.includes("right");
    const top = resize.edge.includes("top");
    const bottom = resize.edge.includes("bottom");
    let x = origin.x;
    let y = origin.y;
    let width = origin.width;
    let height = origin.height;

    if (left) {
      width = origin.width - dx;
      x = origin.x + dx;
    } else if (right) {
      width = origin.width + dx;
    }
    if (top) {
      height = origin.height - dy;
      y = origin.y + dy;
    } else if (bottom) {
      height = origin.height + dy;
    }

    const minWidth = 700;
    const minHeight = 440;
    if (width < minWidth) {
      if (left) x = origin.x + origin.width - minWidth;
      width = minWidth;
    }
    if (height < minHeight) {
      if (top) y = origin.y + origin.height - minHeight;
      height = minHeight;
    }
    this.queueBounds({ x, y, width, height });
  };

  private readonly endWindowResize = (): void => {
    const resize = this.windowResize;
    this.windowResize = null;
    if (resize) {
      try {
        resize.capture.releasePointerCapture(resize.pointerId);
      } catch {
        /* capture may already be released */
      }
    }
    document.body.classList.remove("is-window-resizing");
    window.removeEventListener("pointermove", this.onWindowResizeMove);
    window.removeEventListener("pointerup", this.endWindowResize);
    window.removeEventListener("pointercancel", this.endWindowResize);
  };

  private queueBounds(rect: WindowRect): void {
    this.pendingBounds = rect;
    if (this.boundsFrame) return;
    this.boundsFrame = requestAnimationFrame(() => {
      this.boundsFrame = 0;
      this.flushBounds();
    });
  }

  private flushBounds(): void {
    if (this.boundsInFlight) return;
    const rect = this.pendingBounds;
    if (!rect) return;
    this.pendingBounds = null;
    this.boundsInFlight = true;
    void window.zhijian
      .setWindowBounds(rect)
      .catch(() => {})
      .finally(() => {
        this.boundsInFlight = false;
        if (this.pendingBounds) this.flushBounds();
      });
  }

  private queueMove(x: number, y: number): void {
    this.pendingMove = { x, y };
    if (this.moveFrame) return;
    this.moveFrame = requestAnimationFrame(() => {
      this.moveFrame = 0;
      this.flushMove();
    });
  }

  private flushMove(): void {
    if (this.moveInFlight) return;
    const move = this.pendingMove;
    if (!move) return;
    this.pendingMove = null;
    this.moveInFlight = true;
    void window.zhijian
      .moveWindowTo(move.x, move.y)
      .catch(() => {})
      .finally(() => {
        this.moveInFlight = false;
        if (this.pendingMove) this.flushMove();
      });
  }

  private isInteractive(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        "button, .tab, .tabs, .titlebar-tools, .window-controls, .menu, a",
      ),
    );
  }
}
