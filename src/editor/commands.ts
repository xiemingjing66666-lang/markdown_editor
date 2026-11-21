import type { EditorView } from "@codemirror/view";

function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
): boolean {
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to);
  const outerBefore = view.state.sliceDoc(
    Math.max(0, range.from - before.length),
    range.from,
  );
  const outerAfter = view.state.sliceDoc(
    range.to,
    Math.min(view.state.doc.length, range.to + after.length),
  );

  if (
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after)
  ) {
    const inner = selected.slice(before.length, selected.length - after.length);
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: inner },
      selection: { anchor: range.from, head: range.from + inner.length },
      scrollIntoView: true,
    });
    return true;
  }

  if (outerBefore === before && outerAfter === after) {
    view.dispatch({
      changes: [
        { from: range.from - before.length, to: range.from },
        { from: range.to, to: range.to + after.length },
      ],
      selection: {
        anchor: range.from - before.length,
        head: range.to - before.length,
      },
      scrollIntoView: true,
    });
    return true;
  }

  if (range.empty) {
    view.dispatch({
      changes: { from: range.from, insert: before + after },
      selection: { anchor: range.from + before.length },
      scrollIntoView: true,
    });
    return true;
  }

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: before + selected + after },
    selection: {
      anchor: range.from + before.length,
      head: range.from + before.length + selected.length,
    },
    scrollIntoView: true,
  });
  return true;
}

export function toggleBold(view: EditorView): boolean {
  return wrapSelection(view, "**", "**");
}

export function toggleItalic(view: EditorView): boolean {
  return wrapSelection(view, "*", "*");
}

export function toggleInlineCode(view: EditorView): boolean {
  return wrapSelection(view, "`", "`");
}

export function insertLink(view: EditorView): boolean {
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to);
  const label = selected || "链接文字";
  const url = "https://";
  const text = `[${label}](${url})`;
  const labelStart = range.from + 1;
  const urlStart = labelStart + label.length + 2;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: selected
      ? { anchor: urlStart, head: urlStart + url.length }
      : { anchor: labelStart, head: labelStart + label.length },
    scrollIntoView: true,
  });
  return true;
}
