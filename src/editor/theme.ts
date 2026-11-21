import {
  HighlightStyle,
  syntaxTree,
} from "@codemirror/language";
import { EditorView, Decoration, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export const markdownHighlight = HighlightStyle.define([
  { tag: tags.strong, class: "md-strong" },
  { tag: tags.emphasis, class: "md-em" },
  { tag: tags.strikethrough, class: "md-strike" },
  { tag: tags.monospace, class: "md-code-inline" },
  { tag: tags.link, class: "md-link" },
  { tag: tags.url, class: "md-url" },
  { tag: tags.processingInstruction, class: "md-mark" },
  { tag: tags.contentSeparator, class: "md-mark" },
  { tag: tags.meta, class: "md-meta" },
  { tag: tags.invalid, class: "md-invalid" },
]);

const HEADINGS: Record<string, string> = {
  ATXHeading1: "cm-h1",
  ATXHeading2: "cm-h2",
  ATXHeading3: "cm-h3",
  ATXHeading4: "cm-h4",
  ATXHeading5: "cm-h5",
  ATXHeading6: "cm-h6",
  SetextHeading1: "cm-h1",
  SetextHeading2: "cm-h2",
};

function buildDecorations(view: EditorView): DecorationSet {
  const classes = new Map<number, Set<string>>();
  const { doc } = view.state;
  const add = (lineNumber: number, name: string) => {
    if (lineNumber < 1 || lineNumber > doc.lines) return;
    const from = doc.line(lineNumber).from;
    const set = classes.get(from) ?? new Set<string>();
    set.add(name);
    classes.set(from, set);
  };
  const addRange = (from: number, to: number, name: string) => {
    if (to <= from) return;
    const first = doc.lineAt(from).number;
    const last = doc.lineAt(Math.max(from, to - 1)).number;
    for (let line = first; line <= last; line += 1) add(line, name);
  };

  syntaxTree(view.state).iterate({
    from: view.viewport.from,
    to: view.viewport.to,
    enter: (node) => {
      const heading = HEADINGS[node.name];
      if (heading) {
        add(doc.lineAt(node.from).number, heading);
        return;
      }
      if (node.name === "Blockquote") {
        addRange(node.from, node.to, "cm-quote");
        return;
      }
      if (node.name === "FencedCode" || node.name === "CodeBlock") {
        addRange(node.from, node.to, "cm-code");
        const first = doc.lineAt(node.from).number;
        const last = doc.lineAt(Math.max(node.from, node.to - 1)).number;
        add(first, "cm-code-open");
        add(last, "cm-code-close");
        return;
      }
      if (node.name === "Table") {
        addRange(node.from, node.to, "cm-table");
        return;
      }
      if (node.name === "HorizontalRule") {
        add(doc.lineAt(node.from).number, "cm-hr");
      }
    },
  });

  const decorations = [...classes]
    .sort(([a], [b]) => a - b)
    .map(([from, names]) =>
      Decoration.line({ class: [...names].join(" ") }).range(from),
    );
  return Decoration.set(decorations, true);
}

/** Adds calm, document-like line styling without hiding the Markdown source. */
export const liveMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
  },
);

export const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "var(--editor-size)",
      color: "var(--ink)",
      backgroundColor: "transparent",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--font-body)",
      lineHeight: "1.72",
      overflow: "auto",
      overscrollBehavior: "contain",
    },
    ".cm-content": {
      boxSizing: "border-box",
      width: "100%",
      maxWidth: "var(--measure)",
      margin: "0 auto",
      padding: "56px 40px 38vh",
      caretColor: "var(--accent)",
    },
    ".cm-line": {
      padding: "0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeft: "2px solid var(--accent)",
      marginLeft: "-1px",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "var(--selection)",
    },
    ".cm-activeLine": { backgroundColor: "transparent" },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: "var(--accent-soft)",
      outline: "none",
    },
    ".cm-searchMatch": {
      backgroundColor: "var(--accent-soft)",
      outline: "1px solid var(--accent-line)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "var(--accent-selection)",
    },
    ".cm-panels": {
      backgroundColor: "var(--paper-raised)",
      color: "var(--ink)",
      borderColor: "var(--line)",
    },
    ".cm-panel.cm-search": {
      padding: "8px 12px",
      fontFamily: "var(--font-ui)",
      fontSize: "12px",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      borderBottom: "1px solid var(--line)",
    },
    ".cm-panel.cm-search input, .cm-panel.cm-search button": {
      fontFamily: "var(--font-ui)",
      fontSize: "12px",
    },
    ".cm-panel.cm-search input": {
      height: "26px",
      padding: "0 8px",
      border: "1px solid var(--line)",
      borderRadius: "6px",
      background: "var(--paper)",
      color: "var(--ink)",
      outline: "none",
    },
    ".cm-panel.cm-search input:focus": {
      borderColor: "var(--accent-line)",
    },
    ".cm-panel.cm-search button": {
      height: "26px",
      padding: "0 8px",
      border: "1px solid var(--line)",
      borderRadius: "6px",
      background: "transparent",
      color: "var(--ink-2)",
      cursor: "pointer",
    },
    ".cm-panel.cm-search button:hover": {
      background: "var(--hover)",
    },
    ".cm-panel.cm-search label": {
      fontSize: "11px",
      color: "var(--muted)",
      display: "inline-flex",
      alignItems: "center",
      gap: "3px",
    },
    ".cm-tooltip": {
      border: "1px solid var(--line)",
      borderRadius: "8px",
      backgroundColor: "var(--paper-raised)",
      boxShadow: "var(--shadow-menu)",
      color: "var(--ink)",
      fontFamily: "var(--font-ui)",
      fontSize: "12px",
    },
  },
  { dark: false },
);
