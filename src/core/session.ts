import type {
  AppState,
  Doc,
  DocId,
  LayoutNode,
  LeafNode,
  SplitNode,
} from "./model";

export const SESSION_KEY = "zhijian.session.v1";

interface SessionDoc {
  id: DocId;
  path: string | null;
  name: string;
  /** Unsaved text only. Clean files are always read back from disk. */
  draft?: string;
}

interface SessionSplit {
  kind: "split";
  id: string;
  dir: "row" | "col";
  ratio: number;
  children: [SessionLayout, SessionLayout];
}

interface SessionLeaf {
  kind: "leaf";
  id: string;
  docId: DocId | null;
  mode: "write" | "read";
}

type SessionLayout = SessionSplit | SessionLeaf;

export interface Session {
  version: 1;
  docs: SessionDoc[];
  tabs: DocId[];
  layout: SessionLayout;
  focusedPaneId: string;
  untitledSeq: number;
}

function serializeLayout(node: LayoutNode): SessionLayout {
  if (node.kind === "leaf") {
    return {
      kind: "leaf",
      id: node.id,
      docId: node.docId,
      mode: node.mode,
    };
  }
  return {
    kind: "split",
    id: node.id,
    dir: node.dir,
    ratio: node.ratio,
    children: [serializeLayout(node.children[0]), serializeLayout(node.children[1])],
  };
}

export function serializeSession(state: AppState): Session {
  const docs = state.tabs
    .map((id) => state.docs[id])
    .filter((doc): doc is Doc => Boolean(doc))
    .map((doc) => {
      const entry: SessionDoc = {
        id: doc.id,
        path: doc.path,
        name: doc.name,
      };
      if (doc.text !== doc.savedText) entry.draft = doc.text;
      return entry;
    });
  return {
    version: 1,
    docs,
    tabs: docs.map((doc) => doc.id),
    layout: serializeLayout(state.layout),
    focusedPaneId: state.focusedPaneId,
    untitledSeq: state.untitledSeq,
  };
}

export function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<Session>;
  if (session.version !== 1) return false;
  if (!Array.isArray(session.docs) || !Array.isArray(session.tabs)) return false;
  if (typeof session.focusedPaneId !== "string") return false;
  if (!Number.isFinite(session.untitledSeq)) return false;
  return session.docs.every(
    (doc) =>
      doc &&
      typeof doc.id === "string" &&
      typeof doc.name === "string" &&
      (doc.path === null || typeof doc.path === "string") &&
      (doc.draft === undefined || typeof doc.draft === "string"),
  ) && isSessionLayout(session.layout);
}

function isSessionLayout(value: unknown): value is SessionLayout {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<SessionLayout>;
  if (node.kind === "leaf") {
    return (
      typeof node.id === "string" &&
      (node.docId === null || typeof node.docId === "string") &&
      (node.mode === "write" || node.mode === "read")
    );
  }
  if (node.kind === "split") {
    const split = node as Partial<SessionSplit>;
    return (
      typeof split.id === "string" &&
      (split.dir === "row" || split.dir === "col") &&
      typeof split.ratio === "number" &&
      Array.isArray(split.children) &&
      split.children.length === 2 &&
      isSessionLayout(split.children[0]) &&
      isSessionLayout(split.children[1])
    );
  }
  return false;
}

/** Rebuilds a live layout from a validated session, dropping unknown documents. */
export function hydrateLayout(
  node: SessionLayout,
  docs: Record<DocId, Doc>,
): LayoutNode {
  if (node.kind === "leaf") {
    const leaf: LeafNode = {
      kind: "leaf",
      id: node.id,
      docId: node.docId && docs[node.docId] ? node.docId : null,
      mode: node.mode,
    };
    return leaf;
  }
  const split: SplitNode = {
    kind: "split",
    id: node.id,
    dir: node.dir,
    ratio: Math.max(0.08, Math.min(0.92, node.ratio)),
    children: [
      hydrateLayout(node.children[0], docs),
      hydrateLayout(node.children[1], docs),
    ],
  };
  return split;
}

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* A full disk or private context should not break editing. */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* no-op */
  }
}
