import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  deleteMarkupBackward,
  insertNewlineContinueMarkup,
  markdown,
} from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import {
  highlightSelectionMatches,
  search,
  searchKeymap,
} from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  keymap,
} from "@codemirror/view";
import {
  insertLink,
  toggleBold,
  toggleItalic,
} from "./commands";
import { editorTheme, liveMarkdown, markdownHighlight } from "./theme";

export interface EditorCallbacks {
  onChange: (text: string) => void;
  onFocus: () => void;
}

function extensions(callbacks: EditorCallbacks) {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    EditorView.lineWrapping,
    EditorState.tabSize.of(2),
    markdown(),
    syntaxHighlighting(markdownHighlight),
    liveMarkdown,
    editorTheme,
    highlightSelectionMatches(),
    search({ top: true }),
    keymap.of([
      { key: "Enter", run: insertNewlineContinueMarkup },
      { key: "Backspace", run: deleteMarkupBackward },
      { key: "Mod-b", run: toggleBold },
      { key: "Mod-i", run: toggleItalic },
      { key: "Mod-k", run: insertLink },
      indentWithTab,
      ...searchKeymap,
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) callbacks.onChange(update.state.doc.toString());
    }),
    EditorView.domEventHandlers({
      focus: () => {
        callbacks.onFocus();
      },
      pointerdown: () => {
        callbacks.onFocus();
      },
    }),
    EditorView.contentAttributes.of({
      spellcheck: "true",
      autocorrect: "off",
      autocapitalize: "off",
      "aria-label": "Markdown 编辑器",
    }),
  ];
}

export function createEditorState(
  text: string,
  callbacks: EditorCallbacks,
): EditorState {
  return EditorState.create({
    doc: text,
    extensions: extensions(callbacks),
  });
}

export function createEditorView(
  parent: HTMLElement,
  text: string,
  callbacks: EditorCallbacks,
): EditorView {
  return new EditorView({
    state: createEditorState(text, callbacks),
    parent,
  });
}
