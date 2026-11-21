export interface MenuItem {
  label: string;
  shortcut?: string;
  icon?: string;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

export interface MenuOptions {
  align?: "start" | "end";
  className?: string;
}

let current: { element: HTMLElement; dispose: () => void } | null = null;

export function closeMenu(): void {
  current?.dispose();
  current = null;
}

export function openMenu(
  anchor: HTMLElement,
  items: MenuItem[],
  options: MenuOptions = {},
): () => void {
  closeMenu();

  const menu = document.createElement("div");
  menu.className = `menu ${options.className ?? ""}`.trim();
  menu.setAttribute("role", "menu");
  menu.dataset.testid = "menu";

  const buttons: HTMLButtonElement[] = [];

  for (const item of items) {
    if (item.separatorBefore) {
      const separator = document.createElement("div");
      separator.className = "menu-separator";
      separator.setAttribute("role", "separator");
      menu.append(separator);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-item";
    button.setAttribute("role", "menuitem");
    button.disabled = Boolean(item.disabled);
    if (item.danger) button.classList.add("is-danger");
    if (item.icon) {
      const glyph = document.createElement("span");
      glyph.className = "menu-icon";
      glyph.innerHTML = item.icon;
      button.append(glyph);
    }
    const label = document.createElement("span");
    label.className = "menu-label";
    label.textContent = item.label;
    button.append(label);
    if (item.shortcut) {
      const shortcut = document.createElement("span");
      shortcut.className = "menu-shortcut";
      shortcut.textContent = item.shortcut;
      button.append(shortcut);
    }
    button.addEventListener("click", () => {
      if (button.disabled) return;
      closeMenu();
      item.onSelect();
    });
    buttons.push(button);
    menu.append(button);
  }

  document.body.append(menu);

  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const margin = 8;
  let left =
    options.align === "end" ? rect.right - menuRect.width : rect.left;
  left = Math.min(
    Math.max(margin, left),
    window.innerWidth - menuRect.width - margin,
  );
  let top = rect.bottom + 6;
  if (top + menuRect.height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - menuRect.height - 6);
  }
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  menu.classList.add("is-open");

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Node | null;
    if (target && (menu.contains(target) || anchor.contains(target))) return;
    closeMenu();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      anchor.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const enabled = buttons.filter((button) => !button.disabled);
      if (!enabled.length) return;
      const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        event.key === "ArrowDown"
          ? (index + 1 + enabled.length) % enabled.length
          : (index - 1 + enabled.length) % enabled.length;
      enabled[next]?.focus();
    }
  };
  const onResize = () => closeMenu();

  const timer = window.setTimeout(() => {
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onResize);
  }, 0);

  const dispose = () => {
    window.clearTimeout(timer);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("resize", onResize);
    menu.remove();
    if (current?.element === menu) current = null;
  };

  current = { element: menu, dispose };
  buttons.find((button) => !button.disabled)?.focus({ preventScroll: true });
  return dispose;
}
