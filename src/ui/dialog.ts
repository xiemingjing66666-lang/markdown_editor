export interface DialogAction {
  label: string;
  value: string;
  tone?: "primary" | "default" | "danger";
}

export interface DialogOptions {
  title: string;
  body?: string;
  actions: DialogAction[];
  testid?: string;
  onCancel?: string;
}

export function showDialog(options: DialogOptions): Promise<string> {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.dataset.testid = options.testid ?? "modal";

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", options.title);
    modal.tabIndex = -1;

    const title = document.createElement("h2");
    title.className = "modal-title";
    title.textContent = options.title;
    modal.append(title);

    if (options.body) {
      const body = document.createElement("p");
      body.className = "modal-body";
      body.textContent = options.body;
      modal.append(body);
    }

    const actions = document.createElement("div");
    actions.className = "modal-actions";

    const buttons: HTMLButtonElement[] = [];
    for (const action of options.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `button button-${action.tone ?? "default"}`;
      button.textContent = action.label;
      button.addEventListener("click", () => finish(action.value));
      buttons.push(button);
      actions.append(button);
    }
    modal.append(actions);
    backdrop.append(modal);
    document.body.append(backdrop);

    const finish = (value: string) => {
      window.removeEventListener("keydown", onKeyDown, true);
      backdrop.classList.remove("is-open");
      window.setTimeout(() => {
        backdrop.remove();
        previousFocus?.focus({ preventScroll: true });
      }, 140);
      resolve(value);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(options.onCancel ?? options.actions.at(-1)?.value ?? "cancel");
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = buttons.filter((button) => !button.disabled);
      if (!focusable.length) return;
      const index = focusable.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault();
      const next = event.shiftKey
        ? (index - 1 + focusable.length) % focusable.length
        : (index + 1) % focusable.length;
      focusable[next]?.focus();
    };

    backdrop.addEventListener("pointerdown", (event) => {
      if (event.target === backdrop) {
        finish(options.onCancel ?? options.actions.at(-1)?.value ?? "cancel");
      }
    });
    window.addEventListener("keydown", onKeyDown, true);

    requestAnimationFrame(() => {
      backdrop.classList.add("is-open");
      const primary =
        buttons.find((button) => button.classList.contains("button-primary")) ??
        buttons[0];
      primary?.focus({ preventScroll: true });
    });
  });
}
