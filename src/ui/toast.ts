import { icon } from "./icons";

let region: HTMLElement | null = null;

function ensureRegion(): HTMLElement {
  if (region) return region;
  region = document.createElement("div");
  region.className = "toast-region";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  document.body.append(region);
  return region;
}

export function showToast(
  message: string,
  tone: "neutral" | "error" = "neutral",
): void {
  const host = ensureRegion();
  const toast = document.createElement("div");
  toast.className = `toast ${tone === "error" ? "is-error" : ""}`.trim();
  toast.dataset.testid = "toast";

  if (tone === "error") {
    const glyph = document.createElement("span");
    glyph.className = "toast-icon";
    glyph.innerHTML = icon("alert");
    toast.append(glyph);
  }
  const text = document.createElement("span");
  text.textContent = message;
  toast.append(text);

  host.append(toast);
  while (host.children.length > 3) host.firstElementChild?.remove();

  requestAnimationFrame(() => toast.classList.add("is-visible"));
  const timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), 220);
  }, tone === "error" ? 5200 : 2800);
  toast.addEventListener("click", () => {
    window.clearTimeout(timer);
    toast.remove();
  });
}
