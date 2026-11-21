import { describe, expect, it } from "vitest";
import {
  addDoc,
  createEmptyState,
  makeDoc,
  setDocText,
  splitPane,
  type AppState,
  type LayoutNode,
} from "../src/core/model";
import {
  hydrateLayout,
  isSession,
  serializeSession,
  type Session,
} from "../src/core/session";

function stateWithSplit(): { state: AppState; first: string } {
  let state = createEmptyState();
  const first = makeDoc({
    name: "first.md",
    path: "C:\\notes\\first.md",
    text: "# one",
  });
  state = addDoc(state, first);
  const second = makeDoc({ name: "second.md", text: "# two" });
  state = addDoc(state, second);
  const split = splitPane(state, state.focusedPaneId, "right", first.id);
  return { state: split, first: first.id };
}

function leavesOf(node: LayoutNode): Array<{ docId: string | null }> {
  if (node.kind === "leaf") return [node];
  return [...leavesOf(node.children[0]), ...leavesOf(node.children[1])];
}

describe("session serialization", () => {
  it("stores drafts only for dirty documents", () => {
    const { state, first } = stateWithSplit();
    const clean = serializeSession(state);
    expect(clean.docs.find((doc) => doc.id === first)?.draft).toBeUndefined();

    const dirty = setDocText(state, first, "# changed");
    const session = serializeSession(dirty);
    expect(session.docs.find((doc) => doc.id === first)?.draft).toBe("# changed");
  });

  it("keeps the split tree and modes", () => {
    const { state } = stateWithSplit();
    const session = serializeSession(state);
    const hydrated = hydrateLayout(session.layout, state.docs);
    expect(hydrated.kind).toBe("split");
    expect(serializeSession({ ...state, layout: hydrated }).layout).toEqual(
      session.layout,
    );
  });

  it("drops documents missing from disk", () => {
    const { state } = stateWithSplit();
    const session = serializeSession(state);
    const hydrated = hydrateLayout(session.layout, {});
    expect(leavesOf(hydrated).every((leaf) => leaf.docId === null)).toBe(true);
  });

  it("rejects malformed sessions", () => {
    expect(isSession(null)).toBe(false);
    expect(isSession({ version: 2 })).toBe(false);
    expect(
      isSession({
        version: 1,
        docs: [],
        tabs: [],
        focusedPaneId: "pane",
        untitledSeq: 0,
        layout: {
          kind: "split",
          id: "s",
          dir: "diagonal",
          ratio: 0.5,
          children: [],
        },
      }),
    ).toBe(false);
  });

  it("accepts a minimal valid session", () => {
    const { state } = stateWithSplit();
    const session = serializeSession(state) as Session;
    expect(isSession(session)).toBe(true);
  });
});
