import type {
  EditorSize,
  Preferences,
  ThemeMode,
} from "../core/preferences";
import { closeMenu } from "./menu";

interface SettingsPanelOptions {
  onChange: (preferences: Preferences) => void;
  onSetDefault: () => void;
}

export class SettingsPanel {
  readonly element: HTMLElement;
  private preferences: Preferences;
  private anchor: HTMLElement | null = null;
  private isOpen = false;
  private dismiss: (() => void) | null = null;
  private readonly themeButtons = new Map<string, HTMLButtonElement>();
  private readonly sizeButtons = new Map<string, HTMLButtonElement>();
  private autosaveButton!: HTMLButtonElement;

  constructor(private readonly options: SettingsPanelOptions) {
    this.preferences = {
      theme: "system",
      editorSize: "normal",
      autosave: true,
    };
    this.element = document.createElement("div");
    this.element.className = "settings-popover";
    this.element.setAttribute("role", "dialog");
    this.element.setAttribute("aria-label", "设置");
    this.element.dataset.testid = "settings-popover";

    this.element.append(
      this.row(
        "外观",
        this.segment(
          [
            { value: "system", label: "跟随" },
            { value: "light", label: "浅色" },
            { value: "dark", label: "深色" },
          ],
          (value) => this.update({ theme: value as ThemeMode }),
          this.themeButtons,
          "theme",
        ),
      ),
      this.row(
        "字号",
        this.segment(
          [
            { value: "small", label: "小" },
            { value: "normal", label: "标准" },
            { value: "large", label: "大" },
          ],
          (value) => this.update({ editorSize: value as EditorSize }),
          this.sizeButtons,
          "size",
        ),
      ),
      this.row("自动保存", this.switch()),
      this.row("打开方式", this.action("设为默认", () => this.options.onSetDefault())),
    );

    this.element.addEventListener("pointerdown", (event) => event.stopPropagation());
  }

  open(anchor: HTMLElement, preferences: Preferences): void {
    if (this.isOpen && this.anchor === anchor) {
      this.close();
      return;
    }
    this.close();
    closeMenu();
    this.preferences = preferences;
    this.render();
    this.anchor = anchor;
    document.body.append(this.element);
    this.element.classList.add("is-open");
    this.isOpen = true;
    this.position(anchor);
    requestAnimationFrame(() => {
      this.position(anchor);
      this.element.querySelector<HTMLElement>(".is-selected")?.focus({
        preventScroll: true,
      });
    });

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (this.element.contains(target) || anchor.contains(target))) return;
      this.close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.close(true);
    };
    const onResize = () => this.close();
    const timer = window.setTimeout(() => {
      window.addEventListener("pointerdown", onPointerDown, true);
      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("resize", onResize);
    }, 0);
    this.dismiss = () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onResize);
    };
  }

  setPreferences(preferences: Preferences): void {
    this.preferences = preferences;
    if (this.isOpen) this.render();
  }

  close(restoreFocus = false): void {
    if (!this.isOpen) return;
    this.dismiss?.();
    this.dismiss = null;
    this.isOpen = false;
    this.element.classList.remove("is-open");
    this.element.remove();
    const anchor = this.anchor;
    this.anchor = null;
    if (restoreFocus) anchor?.focus({ preventScroll: true });
  }

  private row(label: string, control: HTMLElement): HTMLElement {
    const row = document.createElement("div");
    row.className = "setting-row";
    const name = document.createElement("span");
    name.className = "setting-label";
    name.textContent = label;
    row.append(name, control);
    return row;
  }

  private segment<T extends string>(
    values: Array<{ value: T; label: string }>,
    onSelect: (value: T) => void,
    buttons: Map<T, HTMLButtonElement>,
    testid: string,
  ): HTMLElement {
    const group = document.createElement("div");
    group.className = "segmented";
    group.setAttribute("role", "group");
    for (const item of values) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.value = item.value;
      button.dataset.testid = `settings-${testid}-${item.value}`;
      button.textContent = item.label;
      button.addEventListener("click", () => onSelect(item.value));
      buttons.set(item.value, button);
      group.append(button);
    }
    return group;
  }

  private action(label: string, onClick: () => void): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "setting-action";
    button.dataset.testid = "settings-default";
    button.textContent = label;
    button.addEventListener("click", () => {
      this.close();
      onClick();
    });
    return button;
  }

  private switch(): HTMLElement {    const button = document.createElement("button");
    button.type = "button";
    button.className = "switch";
    button.setAttribute("role", "switch");
    button.dataset.testid = "settings-autosave";
    button.setAttribute("aria-label", "自动保存");
    button.addEventListener("click", () => {
      this.update({ autosave: !this.preferences.autosave });
    });
    this.autosaveButton = button;
    return button;
  }

  private update(patch: Partial<Preferences>): void {
    const next = { ...this.preferences, ...patch };
    this.preferences = next;
    this.render();
    this.options.onChange(next);
  }

  private render(): void {
    for (const [value, button] of this.themeButtons) {
      const selected = this.preferences.theme === value;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    for (const [value, button] of this.sizeButtons) {
      const selected = this.preferences.editorSize === value;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    this.autosaveButton.setAttribute(
      "aria-checked",
      String(this.preferences.autosave),
    );
  }

  private position(anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    const panel = this.element.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(
      Math.max(margin, rect.right - panel.width),
      window.innerWidth - panel.width - margin,
    );
    let top = rect.bottom + 6;
    if (top + panel.height > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - panel.height - 6);
    }
    this.element.style.left = `${Math.round(left)}px`;
    this.element.style.top = `${Math.round(top)}px`;
  }
}
