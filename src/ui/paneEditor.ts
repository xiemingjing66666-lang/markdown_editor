import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createEditorState, createEditorView } from "../editor/editor";
import { renderMarkdown, type OutlineHeading } from "../core/markdown";
import type { Doc } from "../core/model";
import { openLightbox } from "./lightbox";

export interface PaneEditorCallbacks {
  onTextChange: (docId: string, text: string) => void;
  onFocus: () => void;
  onOpenLocal: (filePath: string) => void;
  onOpenExternal: (url: string) => void;
}

export class PaneEditor {
  readonly root: HTMLElement;
  private readonly editorHost: HTMLElement;
  private readonly preview: HTMLElement;
  private view: EditorView | null = null;
  private readonly states = new Map<string, EditorState>();
  private readonly scrollPositions = new Map<string, number>();
  private docId: string | null = null;
  private currentDoc: Doc | null = null;
  private currentText = "";
  private mode: "write" | "read" = "write";

  constructor(
    readonly paneId: string,
    private readonly callbacks: PaneEditorCallbacks,
  ) {
    this.root = document.createElement("div");
    this.root.className = "pane-inner";
    this.root.dataset.testid = "pane";

    this.editorHost = document.createElement("div");
    this.editorHost.className = "editor-host";
    this.preview = document.createElement("article");
    this.preview.className = "preview";
    this.preview.dataset.testid = "preview";
    this.preview.setAttribute("aria-label", "文档预览");
    this.preview.addEventListener("click", (event) => this.handlePreviewClick(event));
    this.root.append(this.editorHost, this.preview);
  }

  attach(container: HTMLElement): void {
    container.append(this.root);
  }

  get element(): HTMLElement {
    return this.root;
  }

  setDoc(doc: Doc, options: { focus?: boolean; force?: boolean } = {}): void {
    if (!options.force && this.docId === doc.id) {
      if (this.currentText !== doc.text) {
        this.replaceText(doc);
      }
      if (this.currentDoc?.path !== doc.path) {
        this.currentDoc = doc;
        if (this.mode === "read") this.renderPreview(doc);
      }
      if (options.focus) this.focus();
      return;
    }

    this.rememberPosition();
    this.docId = doc.id;
    this.currentDoc = doc;
    this.currentText = doc.text;
    this.root.classList.toggle("is-read", this.mode === "read");

    if (this.mode === "read") {
      this.renderPreview(doc);
      this.restoreScroll();
      return;
    }

    this.showEditor(doc);
    if (options.focus) this.focus();
  }

  setMode(mode: "write" | "read", options: { focus?: boolean } = {}): void {
    if (this.mode === mode) {
      if (mode === "write" && options.focus) this.focus();
      return;
    }
    this.rememberPosition();
    this.mode = mode;
    this.root.classList.toggle("is-read", mode === "read");
    if (!this.docId || !this.currentDoc) return;
    const doc = this.currentDoc;
    if (mode === "read") {
      this.renderPreview(doc);
    } else {
      this.showEditor(doc);
      if (options.focus) this.focus();
    }
    this.restoreScroll();
  }

  focus(): void {
    if (this.mode === "write") this.view?.focus();
  }

  capturePosition(): void {
    this.rememberPosition();
  }

  remeasure(): void {
    this.view?.requestMeasure();
  }

  jumpToHeading(heading: OutlineHeading): void {
    if (this.mode === "write" && this.view) {
      const lineNumber = Math.min(
        Math.max(heading.line + 1, 1),
        this.view.state.doc.lines,
      );
      const line = this.view.state.doc.line(lineNumber);
      this.view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, {
          y: "start",
          yMargin: 56,
        }),
      });
      this.view.focus();
      return;
    }
    const target = this.preview.querySelector<HTMLElement>(
      `#${CSS.escape(heading.id)}`,
    );
    if (!target) return;
    const top =
      target.getBoundingClientRect().top -
      this.preview.getBoundingClientRect().top +
      this.preview.scrollTop -
      24;
    this.preview.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  restorePosition(): void {
    this.restoreScroll();
    this.view?.requestMeasure();
  }

  invalidateDoc(doc: Doc): void {
    this.states.delete(doc.id);
    if (this.docId === doc.id) {
      this.currentDoc = doc;
      this.currentText = doc.text;
      if (this.mode === "read") {
        this.renderPreview(doc);
      } else {
        this.showEditor(doc);
      }
    }
  }

  dropDoc(docId: string): void {
    this.states.delete(docId);
    this.scrollPositions.delete(`${docId}:write`);
    this.scrollPositions.delete(`${docId}:read`);
    if (this.docId === docId) {
      this.docId = null;
      this.currentDoc = null;
      this.currentText = "";
      this.editorHost.replaceChildren();
      this.preview.replaceChildren();
      this.view?.destroy();
      this.view = null;
    }
  }

  destroy(): void {
    this.view?.scrollDOM.removeEventListener("scroll", this.onScroll);
    this.view?.destroy();
    this.view = null;
    this.root.remove();
  }

  private readonly onScroll = () => {
    if (!this.docId || !this.view) return;
    this.scrollPositions.set(this.scrollKey(this.docId), this.view.scrollDOM.scrollTop);
  };

  private showEditor(doc: Doc): void {
    const state = this.stateFor(doc);
    if (!this.view) {
      this.view = createEditorView(this.editorHost, doc.text, {
        onChange: (text) => {
          this.currentText = text;
          if (this.docId) this.callbacks.onTextChange(this.docId, text);
        },
        onFocus: () => this.callbacks.onFocus(),
      });
      this.view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
      this.view.setState(state);
    } else {
      this.view.setState(state);
    }
    this.editorHost.hidden = false;
    this.preview.hidden = true;
    this.restoreScroll();
  }

  private stateFor(doc: Doc): EditorState {
    const cached = this.states.get(doc.id);
    if (cached && cached.doc.toString() === doc.text) return cached;
    const state = createEditorState(doc.text, {
      onChange: (text) => {
        this.currentText = text;
        if (this.docId) this.callbacks.onTextChange(this.docId, text);
      },
      onFocus: () => this.callbacks.onFocus(),
    });
    this.states.set(doc.id, state);
    return state;
  }

  private replaceText(doc: Doc): void {
    this.currentText = doc.text;
    if (this.mode === "write" && this.view) {
      const state = createEditorState(doc.text, {
        onChange: (text) => {
          this.currentText = text;
          if (this.docId) this.callbacks.onTextChange(this.docId, text);
        },
        onFocus: () => this.callbacks.onFocus(),
      });
      this.states.set(doc.id, state);
      this.view.setState(state);
    } else if (this.mode === "read") {
      this.renderPreview(doc);
    }
  }

  private renderPreview(doc: Doc): void {
    this.preview.innerHTML = renderMarkdown(doc.text, doc.path);
    this.preview.hidden = false;
    this.editorHost.hidden = true;
    this.preview.scrollTop = this.scrollPositions.get(this.scrollKey(doc.id)) ?? 0;
  }

  private rememberPosition(): void {
    if (!this.docId) return;
    const key = this.scrollKey(this.docId);
    if (this.mode === "write" && this.view) {
      this.scrollPositions.set(key, this.view.scrollDOM.scrollTop);
    } else if (this.mode === "read") {
      this.scrollPositions.set(key, this.preview.scrollTop);
    }
  }

  private restoreScroll(): void {
    if (!this.docId) return;
    const position = this.scrollPositions.get(this.scrollKey(this.docId)) ?? 0;
    const apply = () => {
      if (this.mode === "write" && this.view) this.view.scrollDOM.scrollTop = position;
      else this.preview.scrollTop = position;
    };
    apply();
    requestAnimationFrame(apply);
  }

  private scrollKey(docId: string): string {
    return `${docId}:${this.mode}`;
  }

  private handlePreviewClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const media = target.closest("img, video");
    if (media instanceof HTMLImageElement || media instanceof HTMLVideoElement) {
      event.preventDefault();
      openLightbox(media, media);
      return;
    }
    const link = target.closest("a");
    if (!link) return;
    const external = link.getAttribute("data-external");
    if (external) {
      event.preventDefault();
      this.callbacks.onOpenExternal(external);
      return;
    }
    const localPath = link.getAttribute("data-local-path");
    if (localPath) {
      event.preventDefault();
      this.callbacks.onOpenLocal(localPath);
      return;
    }
    const anchor = link.getAttribute("data-anchor");
    if (anchor) {
      event.preventDefault();
      const targetElement = this.preview.querySelector(
        `[id="${CSS.escape(anchor)}"]`,
      );
      targetElement?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}
