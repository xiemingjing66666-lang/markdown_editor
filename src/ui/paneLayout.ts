import type {
  AppState,
  Doc,
  LayoutNode,
  LeafNode,
  SplitNode,
} from "../core/model";
import type { OutlineHeading } from "../core/markdown";
import { getLeaves } from "../core/model";
import { PaneEditor } from "./paneEditor";

export interface PaneLayoutDeps {
  onFocusPane: (paneId: string) => void;
  onTextChange: (docId: string, text: string) => void;
  onOpenLocal: (filePath: string) => void;
  onOpenExternal: (url: string) => void;
  onRatioChange: (splitId: string, ratio: number) => void;
}

function shapeOf(node: LayoutNode): string {
  if (node.kind === "leaf") return `L:${node.id}`;
  return `S:${node.id}(${shapeOf(node.children[0])},${shapeOf(node.children[1])})`;
}

export class PaneLayout {
  private controllers = new Map<string, PaneEditor>();
  private shape = "";
  private state: AppState | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly deps: PaneLayoutDeps,
  ) {}

  update(state: AppState): void {
    this.state = state;
    const shape = shapeOf(state.layout);
    if (shape !== this.shape) {
      this.shape = shape;
      this.rebuild(state);
      return;
    }
    this.sync(state);
  }

  focusEditor(paneId: string): void {
    this.controllers.get(paneId)?.focus();
  }

  dropDoc(docId: string): void {
    for (const controller of this.controllers.values()) controller.dropDoc(docId);
  }

  remeasure(): void {
    for (const controller of this.controllers.values()) controller.remeasure();
  }

  jumpToHeading(paneId: string, heading: OutlineHeading): void {
    this.controllers.get(paneId)?.jumpToHeading(heading);
  }

  invalidateDoc(doc: Doc): void {
    for (const controller of this.controllers.values()) {
      controller.invalidateDoc(doc);
    }
  }

  private rebuild(state: AppState): void {
    const hadEditorFocus = this.host.contains(document.activeElement);
    for (const controller of this.controllers.values()) controller.capturePosition();
    this.host.replaceChildren();
    this.host.append(this.renderNode(state.layout));
    this.sync(state);
    const activePane = state.focusedPaneId;
    requestAnimationFrame(() => {
      for (const controller of this.controllers.values()) controller.restorePosition();
      if (hadEditorFocus) this.controllers.get(activePane)?.focus();
    });
  }

  private sync(state: AppState): void {
    const leaves = getLeaves(state.layout);
    this.host.classList.toggle("has-split", leaves.length > 1);
    const visibleIds = new Set<string>();
    for (const leaf of leaves) {
      visibleIds.add(leaf.id);
      const paneElement = this.host.querySelector<HTMLElement>(
        `[data-pane-id="${cssEscape(leaf.id)}"]`,
      );
      if (!paneElement) continue;
      paneElement.classList.toggle("is-focused", leaf.id === state.focusedPaneId);
      const body = paneElement.querySelector<HTMLElement>(".pane-body");
      if (!body) continue;
      const controller = this.ensureController(leaf.id);
      if (controller.element.parentElement !== body) controller.attach(body);
      const doc = leaf.docId ? state.docs[leaf.docId] : null;
      const blank = paneElement.querySelector<HTMLElement>(".pane-blank");
      if (blank) blank.hidden = Boolean(doc);
      controller.element.hidden = !doc;
      if (doc) {
        controller.setMode(leaf.mode);
        controller.setDoc(doc);
      }
    }

    for (const [paneId, controller] of this.controllers) {
      if (!visibleIds.has(paneId)) {
        controller.destroy();
        this.controllers.delete(paneId);
      }
    }

    for (const split of collectSplits(state.layout)) {
      this.applyRatio(split);
    }
  }

  private renderNode(node: LayoutNode): HTMLElement {
    if (node.kind === "leaf") return this.renderLeaf(node);
    return this.renderSplit(node);
  }

  private renderLeaf(leaf: LeafNode): HTMLElement {
    const pane = document.createElement("section");
    pane.className = "pane";
    pane.dataset.paneId = leaf.id;
    pane.dataset.testid = "pane";

    const body = document.createElement("div");
    body.className = "pane-body";
    const blank = document.createElement("div");
    blank.className = "pane-blank";
    body.append(blank);
    pane.append(body);

    pane.addEventListener("pointerdown", () => {
      if (this.state?.focusedPaneId !== leaf.id) this.deps.onFocusPane(leaf.id);
    });
    return pane;
  }

  private renderSplit(split: SplitNode): HTMLElement {
    const element = document.createElement("div");
    element.className = "split";
    element.dataset.splitId = split.id;
    element.dataset.dir = split.dir;

    const first = document.createElement("div");
    first.className = "split-child";
    first.dataset.child = "0";
    first.append(this.renderNode(split.children[0]));

    const divider = document.createElement("div");
    divider.className = "split-divider";
    divider.setAttribute("role", "separator");
    divider.setAttribute("aria-orientation", split.dir === "row" ? "vertical" : "horizontal");
    divider.setAttribute("aria-label", "调整窗格大小");
    divider.tabIndex = 0;
    divider.dataset.testid = "split-divider";
    divider.addEventListener("pointerdown", (event) =>
      this.beginResize(event, split.id, split.dir),
    );
    divider.addEventListener("dblclick", () => this.deps.onRatioChange(split.id, 0.5));
    divider.addEventListener("keydown", (event) => {
      const delta = event.shiftKey ? 0.1 : 0.02;
      if (split.dir === "row" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        this.nudgeRatio(split.id, event.key === "ArrowLeft" ? -delta : delta);
      }
      if (split.dir === "col" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        this.nudgeRatio(split.id, event.key === "ArrowUp" ? -delta : delta);
      }
    });

    const second = document.createElement("div");
    second.className = "split-child";
    second.dataset.child = "1";
    second.append(this.renderNode(split.children[1]));

    element.append(first, divider, second);
    this.applyRatio(split, element);
    return element;
  }

  private ensureController(paneId: string): PaneEditor {
    let controller = this.controllers.get(paneId);
    if (!controller) {
      controller = new PaneEditor(paneId, {
        onTextChange: (docId, text) => this.deps.onTextChange(docId, text),
        onFocus: () => {
          if (this.state?.focusedPaneId !== paneId) this.deps.onFocusPane(paneId);
        },
        onOpenLocal: (filePath) => this.deps.onOpenLocal(filePath),
        onOpenExternal: (url) => this.deps.onOpenExternal(url),
      });
      this.controllers.set(paneId, controller);
    }
    return controller;
  }

  private applyRatio(split: SplitNode, root?: HTMLElement): void {
    const element =
      root ??
      this.host.querySelector<HTMLElement>(`[data-split-id="${cssEscape(split.id)}"]`);
    if (!element) return;
    element.dataset.dir = split.dir;
    const children = element.querySelectorAll<HTMLElement>(":scope > .split-child");
    children[0]?.style.setProperty("flex-grow", String(split.ratio));
    children[1]?.style.setProperty("flex-grow", String(1 - split.ratio));
    const divider = element.querySelector<HTMLElement>(":scope > .split-divider");
    divider?.setAttribute("aria-valuenow", String(Math.round(split.ratio * 100)));
    divider?.setAttribute("aria-valuemin", "8");
    divider?.setAttribute("aria-valuemax", "92");
  }

  private beginResize(event: PointerEvent, splitId: string, dir: "row" | "col"): void {
    event.preventDefault();
    const element = (event.currentTarget as HTMLElement).closest<HTMLElement>(".split");
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const divider = event.currentTarget as HTMLElement;
    divider.setPointerCapture(event.pointerId);
    document.body.classList.add(dir === "row" ? "is-col-resizing" : "is-row-resizing");
    element.classList.add("is-resizing");

    let ratio = (this.state ? findRatio(this.state.layout, splitId) : 0.5) ?? 0.5;

    const onMove = (moveEvent: PointerEvent) => {
      const raw =
        dir === "row"
          ? (moveEvent.clientX - rect.left) / rect.width
          : (moveEvent.clientY - rect.top) / rect.height;
      ratio = Math.max(0.12, Math.min(0.88, raw));
      const children = element.querySelectorAll<HTMLElement>(":scope > .split-child");
      children[0]?.style.setProperty("flex-grow", String(ratio));
      children[1]?.style.setProperty("flex-grow", String(1 - ratio));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("is-col-resizing", "is-row-resizing");
      element.classList.remove("is-resizing");
      this.deps.onRatioChange(splitId, ratio);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
  }

  private nudgeRatio(splitId: string, delta: number): void {
    if (!this.state) return;
    const current = findRatio(this.state.layout, splitId) ?? 0.5;
    this.deps.onRatioChange(splitId, Math.max(0.12, Math.min(0.88, current + delta)));
  }
}

function collectSplits(node: LayoutNode): SplitNode[] {
  if (node.kind === "leaf") return [];
  return [node, ...collectSplits(node.children[0]), ...collectSplits(node.children[1])];
}

function findRatio(node: LayoutNode, splitId: string): number | null {
  if (node.kind === "leaf") return null;
  if (node.id === splitId) return node.ratio;
  return (
    findRatio(node.children[0], splitId) ??
    findRatio(node.children[1], splitId)
  );
}

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value;
}
