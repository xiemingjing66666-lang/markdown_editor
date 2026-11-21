export type ThemeMode = "system" | "light" | "dark";
export type EditorSize = "small" | "normal" | "large";

export interface Preferences {
  theme: ThemeMode;
  editorSize: EditorSize;
  autosave: boolean;
}

export const PREFERENCES_KEY = "zhijian.preferences.v1";

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  editorSize: "normal",
  autosave: true,
};

const EDITOR_SIZE_VALUES: Record<EditorSize, string> = {
  small: "17px",
  normal: "19px",
  large: "21px",
};

const THEMES = new Set<ThemeMode>(["system", "light", "dark"]);
const SIZES = new Set<EditorSize>(["small", "normal", "large"]);

export function normalizePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object") return { ...DEFAULT_PREFERENCES };
  const candidate = value as Partial<Preferences>;
  return {
    theme: THEMES.has(candidate.theme as ThemeMode)
      ? (candidate.theme as ThemeMode)
      : DEFAULT_PREFERENCES.theme,
    editorSize: SIZES.has(candidate.editorSize as EditorSize)
      ? (candidate.editorSize as EditorSize)
      : DEFAULT_PREFERENCES.editorSize,
    autosave:
      typeof candidate.autosave === "boolean"
        ? candidate.autosave
        : DEFAULT_PREFERENCES.autosave,
  };
}

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(preferences: Preferences): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    /* Preference persistence is a convenience, never a startup failure. */
  }
}

export function editorSizeValue(size: EditorSize): string {
  return EDITOR_SIZE_VALUES[size];
}

export function applyPreferences(preferences: Preferences): void {
  const root = document.documentElement;
  root.dataset.theme = preferences.theme;
  root.style.setProperty("--editor-size", editorSizeValue(preferences.editorSize));
}
