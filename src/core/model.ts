/**
 * The whole document/split state is a small, serialisable tree plus a flat
 * document table. Every mutation below is pure, which keeps the UI predictable
 * and makes the model cheap to test.
 */

export type DocId = string;
export type PaneId = string;
export type SplitId = string;

export interface Doc {
  id: DocId;
  path: string | null;
  name: string;
  text: string;
  savedText: string;
  mtimeMs: number | null;
}

export interface LeafNode {
  kind: "leaf";
  id: PaneId;
  docId: DocId | null;
  mode: "write" | "read";
}

export interface SplitNode {
  kind: "split";
  id: SplitId;
  dir: "row" | "col";
  /** Share of the first child, between 0.08 and 0.92. */
  ratio: number;
  children: [LayoutNode, LayoutNode];
}

export type LayoutNode = LeafNode | SplitNode;
export type DropSide = "left" | "right" | "top" | "bottom";

export interface AppState {
  docs: Record<DocId, Doc>;
  tabs: DocId[];
  layout: LayoutNode;
  focusedPaneId: PaneId;
  untitledSeq: number;
}

let sequence = 0;

export function uid(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function isDirty(doc: Doc): boolean {
  return doc.text !== doc.savedText;
}

export function makeDoc(input: {
  path?: string | null;
  name: string;
  text?: string;
  mtimeMs?: number | null;
}): Doc {
  const text = input.text ?? "";
  return {
    id: uid("doc"),
    path: input.path ?? null,
    name: input.name,
    text,
    savedText: text,
    mtimeMs: input.mtimeMs ?? null,
  };
}

export function createEmptyState(): AppState {
  const pane: LeafNode = {
    kind: "leaf",
    id: uid("pane"),
    docId: null,
    mode: "write",
  };
  return {
    docs: {},
    tabs: [],
    layout: pane,
    focusedPaneId: pane.id,
    untitledSeq: 0,
  };
}

export function getLeaves(node: LayoutNode): LeafNode[] {
  if (node.kind === "leaf") return [node];
  return [...getLeaves(node.children[0]), ...getLeaves(node.children[1])];
}

export function firstLeaf(node: LayoutNode): LeafNode {
  let current: LayoutNode = node;
  while (current.kind === "split") current = current.children[0];
  return current;
}

export function findLeaf(node: LayoutNode, paneId: PaneId): LeafNode | null {
  if (node.kind === "leaf") return node.id === paneId ? node : null;
  return findLeaf(node.children[0], paneId) ?? findLeaf(node.children[1], paneId);
}

export function findSplit(node: LayoutNode, splitId: SplitId): SplitNode | null {
  if (node.kind === "leaf") return null;
  if (node.id === splitId) return node;
  return findSplit(node.children[0], splitId) ?? findSplit(node.children[1], splitId);
}

export function findParent(node: LayoutNode, childId: string): SplitNode | null {
  if (node.kind === "leaf") return null;
  if (node.children[0].id === childId || node.children[1].id === childId) {
    return node;
  }
  return (
    findParent(node.children[0], childId) ??
    findParent(node.children[1], childId)
  );
}

export function replaceNode(
  node: LayoutNode,
  targetId: string,
  replacement: LayoutNode,
): LayoutNode {
  if (node.id === targetId) return replacement;
  if (node.kind === "leaf") return node;
  return {
    ...node,
    children: [
      replaceNode(node.children[0], targetId, replacement),
      replaceNode(node.children[1], targetId, replacement),
    ],
  };
}

export function focusedLeaf(state: AppState): LeafNode {
  return findLeaf(state.layout, state.focusedPaneId) ?? firstLeaf(state.layout);
}

export function paneShowingDoc(
  state: AppState,
  docId: DocId,
): LeafNode | null {
  return getLeaves(state.layout).find((leaf) => leaf.docId === docId) ?? null;
}

export function activeDoc(state: AppState): Doc | null {
  const id = focusedLeaf(state).docId;
  return id ? state.docs[id] ?? null : null;
}

export function updatePane(
  state: AppState,
  paneId: PaneId,
  patch: Partial<Pick<LeafNode, "docId" | "mode">>,
): AppState {
  const leaf = findLeaf(state.layout, paneId);
  if (!leaf) return state;
  const layout = replaceNode(state.layout, paneId, { ...leaf, ...patch });
  return { ...state, layout };
}

export function focusPane(state: AppState, paneId: PaneId): AppState {
  if (!findLeaf(state.layout, paneId)) return state;
  return { ...state, focusedPaneId: paneId };
}

export function setPaneDoc(
  state: AppState,
  paneId: PaneId,
  docId: DocId | null,
): AppState {
  if (docId && !state.docs[docId]) return state;
  return updatePane(state, paneId, { docId });
}

export function setPaneMode(
  state: AppState,
  paneId: PaneId,
  mode: LeafNode["mode"],
): AppState {
  return updatePane(state, paneId, { mode });
}

export function addDoc(
  state: AppState,
  doc: Doc,
  paneId: PaneId = state.focusedPaneId,
): AppState {
  const exists = state.docs[doc.id];
  const docs = { ...state.docs, [doc.id]: exists ?? doc };
  const tabs = exists || state.tabs.includes(doc.id)
    ? state.tabs
    : [...state.tabs, doc.id];
  const next = { ...state, docs, tabs };
  return setPaneDoc(next, paneId, doc.id);
}

export function createUntitled(state: AppState): { state: AppState; doc: Doc } {
  const seq = state.untitledSeq + 1;
  const used = new Set(Object.values(state.docs).map((doc) => doc.name));
  const base = seq === 1 ? "未命名" : `未命名 ${seq}`;
  const name = used.has(base) ? `未命名 ${seq + 1}` : base;
  const doc = makeDoc({ name });
  return {
    doc,
    state: { ...addDoc(state, doc), untitledSeq: seq },
  };
}

export function setDocText(state: AppState, docId: DocId, text: string): AppState {
  const doc = state.docs[docId];
  if (!doc || doc.text === text) return state;
  return { ...state, docs: { ...state.docs, [docId]: { ...doc, text } } };
}

export function markSaved(
  state: AppState,
  docId: DocId,
  patch: { text?: string; path?: string; name?: string; mtimeMs?: number | null },
): AppState {
  const doc = state.docs[docId];
  if (!doc) return state;
  const text = patch.text ?? doc.text;
  return {
    ...state,
    docs: {
      ...state.docs,
      [docId]: {
        ...doc,
        ...patch,
        text,
        savedText: text,
      },
    },
  };
}

export function updateDoc(
  state: AppState,
  docId: DocId,
  patch: Partial<Omit<Doc, "id">>,
): AppState {
  const doc = state.docs[docId];
  if (!doc) return state;
  return { ...state, docs: { ...state.docs, [docId]: { ...doc, ...patch } } };
}

export function focusDoc(state: AppState, docId: DocId): AppState {
  const pane = paneShowingDoc(state, docId);
  if (pane) return focusPane(state, pane.id);
  return setPaneDoc(state, state.focusedPaneId, docId);
}

export function splitPane(
  state: AppState,
  paneId: PaneId,
  side: DropSide,
  docId: DocId | null,
  mode?: LeafNode["mode"],
): AppState {
  const leaf = findLeaf(state.layout, paneId);
  if (!leaf) return state;
  const newLeaf: LeafNode = {
    kind: "leaf",
    id: uid("pane"),
    docId: docId && state.docs[docId] ? docId : null,
    mode: mode ?? leaf.mode,
  };
  const before = side === "left" || side === "top";
  const split: SplitNode = {
    kind: "split",
    id: uid("split"),
    dir: side === "left" || side === "right" ? "row" : "col",
    ratio: 0.5,
    children: before ? [newLeaf, leaf] : [leaf, newLeaf],
  };
  const layout = replaceNode(state.layout, leaf.id, split);
  return { ...state, layout, focusedPaneId: newLeaf.id };
}

export function closePane(state: AppState, paneId: PaneId): AppState {
  const leaves = getLeaves(state.layout);
  if (leaves.length <= 1) return state;
  const parent = findParent(state.layout, paneId);
  if (!parent) return state;
  const sibling =
    parent.children[0].id === paneId ? parent.children[1] : parent.children[0];
  const layout = replaceNode(state.layout, parent.id, sibling);
  const focusedPaneId = findLeaf(layout, state.focusedPaneId)
    ? state.focusedPaneId
    : firstLeaf(layout).id;
  return { ...state, layout, focusedPaneId };
}

export function closeDoc(state: AppState, docId: DocId): AppState {
  if (!state.docs[docId]) return state;
  const index = state.tabs.indexOf(docId);
  const tabs = state.tabs.filter((id) => id !== docId);
  const docs = { ...state.docs };
  delete docs[docId];
  const replacement =
    tabs.length === 0
      ? null
      : (tabs[Math.min(index, tabs.length - 1)] ?? tabs[tabs.length - 1] ?? null);
  const layout = replaceLeafDocs(state.layout, docId, replacement);
  return { ...state, docs, tabs, layout };
}

function replaceLeafDocs(
  node: LayoutNode,
  docId: DocId,
  replacement: DocId | null,
): LayoutNode {
  if (node.kind === "leaf") {
    return node.docId === docId ? { ...node, docId: replacement } : node;
  }
  return {
    ...node,
    children: [
      replaceLeafDocs(node.children[0], docId, replacement),
      replaceLeafDocs(node.children[1], docId, replacement),
    ],
  };
}

export function setRatio(state: AppState, splitId: SplitId, ratio: number): AppState {
  const split = findSplit(state.layout, splitId);
  if (!split) return state;
  const clamped = Math.max(0.08, Math.min(0.92, ratio));
  return {
    ...state,
    layout: replaceNode(state.layout, splitId, { ...split, ratio: clamped }),
  };
}

export function reorderTabs(
  tabs: DocId[],
  docId: DocId,
  beforeId: DocId | null,
): DocId[] {
  const next = tabs.filter((id) => id !== docId);
  if (beforeId === null || beforeId === docId) return [...next, docId];
  const at = next.indexOf(beforeId);
  if (at === -1) return [...next, docId];
  next.splice(at, 0, docId);
  return next;
}

export function moveTab(
  state: AppState,
  docId: DocId,
  beforeId: DocId | null,
): AppState {
  if (!state.docs[docId]) return state;
  return { ...state, tabs: reorderTabs(state.tabs, docId, beforeId) };
}

export function nextTab(state: AppState, delta: number): DocId | null {
  if (state.tabs.length === 0) return null;
  const current = focusedLeaf(state).docId;
  const index = current ? state.tabs.indexOf(current) : -1;
  const count = state.tabs.length;
  const next = (index + delta + count) % count;
  return state.tabs[next] ?? null;
}

export function splitCount(state: AppState): number {
  return getLeaves(state.layout).length;
}

export function isDocVisible(state: AppState, docId: DocId): boolean {
  return paneShowingDoc(state, docId) !== null;
}
