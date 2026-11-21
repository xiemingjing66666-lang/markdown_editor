import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  editorSizeValue,
  normalizePreferences,
} from "../src/core/preferences";

describe("preferences", () => {
  it("falls back to defaults for malformed values", () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(
      normalizePreferences({ theme: "sepia", editorSize: "huge", autosave: "yes" }),
    ).toEqual(DEFAULT_PREFERENCES);
  });

  it("keeps valid values and merges missing fields", () => {
    expect(
      normalizePreferences({ theme: "dark", editorSize: "large", autosave: false }),
    ).toEqual({ theme: "dark", editorSize: "large", autosave: false });
    expect(normalizePreferences({ theme: "light" })).toEqual({
      theme: "light",
      editorSize: "normal",
      autosave: true,
    });
  });

  it("maps editor sizes to CSS values", () => {
    expect(editorSizeValue("small")).toBe("17px");
    expect(editorSizeValue("normal")).toBe("19px");
    expect(editorSizeValue("large")).toBe("21px");
  });
});
