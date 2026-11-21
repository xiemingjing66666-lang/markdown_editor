import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "katex/dist/katex.min.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/chrome.css";
import "./styles/editor.css";
import "./styles/preview.css";
import "./styles/overlays.css";
import "./styles/settings.css";
import "./styles/outline.css";
import { App } from "./app";
import { resolveBridge } from "./bridge";
import { applyPreferences, loadPreferences } from "./core/preferences";

async function boot(): Promise<void> {
  const preferences = loadPreferences();
  applyPreferences(preferences);
  const bridge = await resolveBridge();
  const app = new App(bridge, preferences);
  await app.start();
}

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const root = document.querySelector<HTMLElement>("#app");
  if (root) {
    root.innerHTML = "";
    const fallback = document.createElement("div");
    fallback.className = "fatal";
    fallback.textContent = message;
    root.append(fallback);
  }
});
