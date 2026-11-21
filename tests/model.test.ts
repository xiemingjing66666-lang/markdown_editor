import { describe, expect, it } from "vitest";
import {
  addDoc,
  closeDoc,
  closePane,
  createEmptyState,
  createUntitled,
  findLeaf,
  firstLeaf,
  focusDoc,
  getLeaves,
  isDirty,
  makeDoc,
  markSaved,
  moveTab,
  nextTab,
  reorderTabs,
  setDocText,
  setPaneDoc,
  setRatio,
  splitPane,
  type AppState,
  type SplitNode,
} from "../src/core/model";

function stateWithTwoDocs(): { state: AppState; a: string; b: string } {
  let state = createEmptyState();
  const a = makeDoc({ name: "a.md", path: "C:\\notes\\a.md", text: "alpha" });
  state = addDoc(state, a);
  const b = makeDoc({ name: "b.md", path: "C:\\notes\\b.md", text: "beta" });
  state = addDoc(state, b);
  return { state, a: a.id, b: b.id };
}

describe("documents", () => {
  it("tracks dirty state from the last saved text", () => {
    const { state, a } = stateWithTwoDocs();
    expect(isDirty(state.docs[a]!)).toBe(false);
    const changed = setDocText(state, a, "changed");
    expect(isDirty(changed.docs[a]!)).toBe(true);
    const saved = markSaved(changed, a, { mtimeMs: 42 });
    expect(isDirty(saved.docs[a]!)).toBe(false);
    expect(saved.docs[a]!.mtimeMs).toBe(42);
  });

  it("creates untitled documents with distinct names", () => {
    const first = createUntitled(createEmptyState());
    const second = createUntitled(first.state);
    expect(first.doc.name).toBe("未命名");
    expect(second.doc.name).toBe("未命名 2");
    expect(second.state.tabs).toHaveLength(2);
  });

  it("closes a document and shows its neighbour", () => {
    const { state, a, b } = stateWithTwoDocs();
    const closed = closeDoc(state, b);
    expect(closed.tabs).toEqual([a]);
    expect(firstLeaf(closed.layout).docId).toBe(a);
    expect(closed.docs[b]).toBeUndefined();
  });

  it("closes every view of a document", () => {
    const { state, a, b } = stateWithTwoDocs();
    const showingA = setPaneDoc(state, state.focusedPaneId, a);
    const split = splitPane(showingA, showingA.focusedPaneId, "right", a);
    expect(getLeaves(split.layout).filter((leaf) => leaf.docId === a)).toHaveLength(2);
    const closed = closeDoc(split, a);
    expect(closed.tabs).toEqual([b]);
    expect(getLeaves(closed.layout).every((leaf) => leaf.docId === b)).toBe(true);
  });
});

describe("tabs", () => {
  it("reorders before a target and to the end", () => {
    expect(reorderTabs(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(reorderTabs(["a", "b", "c"], "a", null)).toEqual(["b", "c", "a"]);
    expect(reorderTabs(["a", "b", "c"], "b", "c")).toEqual(["a", "b", "c"]);
  });

  it("cycles through tabs in both directions", () => {
    const { state, a, b } = stateWithTwoDocs();
    const showingA = setPaneDoc(state, state.focusedPaneId, a);
    expect(nextTab(showingA, 1)).toBe(b);
    expect(nextTab(showingA, -1)).toBe(b);
    expect(nextTab(state, 1)).toBe(a);
    const moved = moveTab(state, a, null);
    expect(moved.tabs).toEqual([b, a]);
  });
});

describe("panes", () => {
  it("splits horizontally and vertically", () => {
    const { state, a, b } = stateWithTwoDocs();
    const row = splitPane(state, state.focusedPaneId, "right", a);
    const root = row.layout as SplitNode;
    expect(root.dir).toBe("row");
    expect(root.ratio).toBe(0.5);
    expect(getLeaves(row.layout)).toHaveLength(2);
    expect(row.focusedPaneId).toBe(getLeaves(row.layout)[1]!.id);

    const col = splitPane(row, row.focusedPaneId, "top", b);
    const nested = getLeaves(col.layout);
    expect(nested).toHaveLength(3);
    expect(
      (col.layout as SplitNode).children.some(
        (child) => child.kind === "split" && child.dir === "col",
      ),
    ).toBe(true);
  });

  it("places a left split before the original pane", () => {
    const { state, a } = stateWithTwoDocs();
    const original = firstLeaf(state.layout);
    const next = splitPane(state, original.id, "left", a);
    const root = next.layout as SplitNode;
    expect(root.children[0].kind).toBe("leaf");
    expect((root.children[1] as { docId: string }).docId).toBe(original.docId);
  });

  it("collapses a pane into its sibling and keeps focus valid", () => {
    const { state, a, b } = stateWithTwoDocs();
    const split = splitPane(state, state.focusedPaneId, "right", a);
    const [left, right] = getLeaves(split.layout);
    const closed = closePane(split, right!.id);
    expect(getLeaves(closed.layout)).toHaveLength(1);
    expect(firstLeaf(closed.layout).id).toBe(left!.id);
    expect(findLeaf(closed.layout, closed.focusedPaneId)).not.toBeNull();
    expect(closed.tabs).toContain(b);
  });

  it("clamps divider ratios", () => {
    const { state, a } = stateWithTwoDocs();
    const split = splitPane(state, state.focusedPaneId, "right", a);
    const splitId = (split.layout as SplitNode).id;
    expect((setRatio(split, splitId, 0).layout as SplitNode).ratio).toBe(0.08);
    expect((setRatio(split, splitId, 1).layout as SplitNode).ratio).toBe(0.92);
    expect((setRatio(split, splitId, 0.31).layout as SplitNode).ratio).toBe(0.31);
  });

  it("focuses an existing pane instead of duplicating a document", () => {
    const { state, a, b } = stateWithTwoDocs();
    const split = splitPane(state, state.focusedPaneId, "right", a);
    const [left, right] = getLeaves(split.layout);
    const focused = focusDoc(split, b);
    expect(focused.focusedPaneId).toBe(left!.id);
    const focusedAgain = focusDoc(focused, a);
    expect(focusedAgain.focusedPaneId).toBe(right!.id);
    expect(getLeaves(focusedAgain.layout).filter((leaf) => leaf.docId === a)).toHaveLength(1);
  });
});
