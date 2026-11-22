import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const cwd = process.cwd();
const work = path.join(cwd, ".tmp", "e2e");
const profile = path.join(cwd, ".tmp", "e2e-profile");
const shots = path.join(cwd, ".tmp", "e2e-shots");
const appPort = 47999;
const debugPort = 9333;

const notesPath = path.join(work, "notes.md");
const fieldPath = path.join(work, "field-notes.md");
const imageNotePath = path.join(work, "image-note.md");
const imagePath = path.join(work, "paper.svg");
const videoPath = path.join(work, "clip.mp4");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="260" viewBox="0 0 720 260">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e8dfcd"/>
      <stop offset="1" stop-color="#d8b49a"/>
    </linearGradient>
  </defs>
  <rect width="720" height="260" fill="url(#g)"/>
  <path d="M70 190 C 180 80, 300 230, 410 110 S 610 60, 660 150" fill="none" stroke="#8c4a32" stroke-width="1.5" opacity=".55"/>
  <circle cx="565" cy="76" r="24" fill="#c25438" opacity=".8"/>
  <text x="70" y="80" fill="#3a3227" font-family="Georgia, serif" font-size="30">paper, light, quiet</text>
  <text x="70" y="222" fill="#5d4b3b" font-family="Georgia, serif" font-size="14" letter-spacing="4">ZHIJIAN</text>
</svg>`;

await rm(work, { recursive: true, force: true });
await rm(profile, { recursive: true, force: true });
await rm(shots, { recursive: true, force: true });
await mkdir(work, { recursive: true });
await mkdir(shots, { recursive: true });

await writeFile(
  notesPath,
  `# 一间自己的房间

写作不是把想法搬运到纸上，而是给它留出可以呼吸的**空隙**。

## 今天要做的事

- 把关于*触感*的段落写完
- 重读第三章，删掉所有解释性的句子
- 给「纸间」挑一款更合适的宋体

> 好的工具退到身后，只留下正在做的事。

### 一些细节

行内代码像铅笔批注：\`command + s\`、\`meta\`。

\`\`\`ts
const note = { title: "纸间" };
\`\`\`

## 公式

质能方程 $E=mc^2$。

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$

| 功能 | 状态 |
| --- | --- |
| 多标签 | 完成 |
| 拆分窗格 | 完成 |
`,
  "utf8",
);
await writeFile(
  fieldPath,
  `# 田野笔记

雨停之后，院子里的气味变了。

## 三件小事

1. 石榴树的新叶
2. 邻居修好的旧收音机
3. 一只在窗台停留很久的鸟

> 记录不是为了留住，而是为了再看一眼。
`,
  "utf8",
);
await writeFile(imagePath, svg, "utf8");
await writeFile(
  videoPath,
  Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]),
);
await writeFile(
  imageNotePath,
  `# 图像

一张纸的颜色，也可以是一张图。

![纸与光](./paper.svg)

![演示视频](./clip.mp4)

> 图像来自文档所在的文件夹。
`,
  "utf8",
);

let child = null;
let browser = null;
const errors = [];

function startApp(files) {
  const env = {
    ...process.env,
    ZHIJIAN_STORAGE: profile,
    ZHIJIAN_PORT: String(appPort),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
  };
  const processHandle = spawn("python", ["-m", "app.main", ...files], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  processHandle.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    if (text.trim() && !text.includes("Using WinForms")) process.stderr.write(text);
  });
  return processHandle;
}

async function waitForCdp() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("WebView2 debugging endpoint did not start");
}

async function connect() {
  await waitForCdp();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  let page = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    page = pages.find((entry) => entry.url().includes(`127.0.0.1:${appPort}`));
    if (page) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!page) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    throw new Error(`App page was not found (${pages.map((entry) => entry.url()).join(", ")})`);
  }
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.waitForSelector(".cm-editor");
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function waitForExit(processHandle, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (processHandle.exitCode !== null) {
      resolve(processHandle.exitCode);
      return;
    }
    const timer = setTimeout(() => reject(new Error("app did not exit")), timeout);
    processHandle.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function closeApp(page) {
  if (!child) return;
  try {
    await page.getByLabel("关闭窗口").click();
  } catch {
    /* page may already be gone */
  }
  await waitForExit(child, 10000).catch(() => {
    child.kill();
  });
  child = null;
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function shot(page, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(shots, name) });
}

try {
  child = startApp([notesPath, fieldPath, imageNotePath]);
  let page = await connect();
  if ((await page.getByTestId("tab").count()) !== 3) {
    throw new Error("expected three launch files to open");
  }

  await page.emulateMedia({ colorScheme: "light" });
  await shot(page, "01-editor-light.png");
  await page.emulateMedia({ colorScheme: "dark" });
  await shot(page, "02-editor-dark.png");
  await page.emulateMedia({ colorScheme: "light" });

  await page.getByTestId("settings").click();
  await page.waitForSelector("[data-testid='settings-popover']");
  await shot(page, "02b-settings-light.png");
  await page.getByTestId("settings-theme-dark").click();
  const theme = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  if (theme.theme !== "dark" || theme.scheme !== "dark") {
    throw new Error(`theme override failed: ${JSON.stringify(theme)}`);
  }
  await shot(page, "02c-settings-dark.png");
  await page.getByTestId("settings-size-large").click();
  const large = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--editor-size").trim(),
  );
  if (large !== "21px") throw new Error(`font size setting failed: ${large}`);
  const autosave = page.getByRole("switch", { name: "自动保存" });
  await autosave.click();
  if ((await autosave.getAttribute("aria-checked")) !== "false") {
    throw new Error("autosave switch did not turn off");
  }
  await autosave.click();
  if ((await autosave.getAttribute("aria-checked")) !== "true") {
    throw new Error("autosave switch did not turn on");
  }
  await page.getByTestId("settings-theme-system").click();
  await page.getByTestId("settings-size-normal").click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  if ((await page.locator("[data-testid='settings-popover']").count()) !== 0) {
    throw new Error("settings did not close");
  }

  await page.waitForTimeout(350);
  const notesTab = page.locator('[data-testid="tab"][title="notes.md"]');
  const notesBox = await notesTab.boundingBox();
  const railBox = await page.getByTestId("tabs").boundingBox();
  if (!notesBox || !railBox) throw new Error("missing tab geometry");
  await page.mouse.move(notesBox.x + notesBox.width / 2, notesBox.y + notesBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.move(railBox.x + railBox.width - 4, notesBox.y + 14, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const order = await page.getByTestId("tab").evaluateAll((tabs) =>
    tabs.map((tab) => tab.getAttribute("title")),
  );
  if (order.at(-1) !== "notes.md") {
    throw new Error(`tab reorder failed: ${order.join(", ")}`);
  }
  await page.locator('[data-testid="tab"][title="notes.md"]').click({ button: "right" });
  await page.waitForSelector(".menu");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\n\n## 自动保存\n\n写入磁盘的句子。\n");
  await page.waitForTimeout(1400);
  const saved = await readFile(notesPath, "utf8");
  if (!saved.includes("写入磁盘的句子。")) {
    throw new Error("autosave did not reach disk");
  }
  if ((await page.locator(".tab.is-active.is-dirty").count()) !== 0) {
    throw new Error("dirty marker did not clear after autosave");
  }

  await appendFile(notesPath, "\n\n## 外部修改\n\n来自另一个编辑器。\n", "utf8");
  await page.locator(".pane.is-focused .cm-content").click();
  await page.keyboard.type("x");
  await page.waitForSelector("[data-testid='conflict-dialog']");
  await page.screenshot({ path: path.join(shots, "03a-conflict.png") });
  await page.getByRole("button", { name: "重新载入" }).click();
  await page.waitForTimeout(600);
  const reloadedText = await page.locator(".pane.is-focused .cm-content").innerText();
  if (!reloadedText.includes("外部修改")) {
    throw new Error("conflict reload did not refresh from disk");
  }
  await shot(page, "03b-conflict-reloaded.png");

  await page.getByTestId("mode-toggle").click();
  await page.waitForSelector(".preview h1");
  await page.waitForSelector(".preview .katex");
  const katexCount = await page.locator(".preview .katex").count();
  if (katexCount < 2) throw new Error(`math did not render (${katexCount})`);
  await page.locator(".preview .math-block").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await shot(page, "03-read-light.png");
  await page.locator(".preview").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByTestId("outline-toggle").click();
  await page.waitForSelector("[data-testid='outline']:not([hidden])");
  await page.waitForFunction(
    () => document.querySelectorAll(".outline-item").length >= 4,
    { timeout: 5000 },
  );
  if ((await page.locator(".outline-item").count()) < 4) {
    throw new Error("outline did not list the document headings");
  }
  await page.locator(".outline-item", { hasText: "公式" }).click();
  await page.waitForTimeout(700);
  const outlineScroll = await page
    .locator(".preview")
    .evaluate((element) => element.scrollTop);
  if (outlineScroll <= 0) throw new Error("outline jump did not scroll the preview");
  await shot(page, "03c-outline.png");
  await page.getByTestId("outline-toggle").click();
  await page.getByTestId("mode-toggle").click();
  await page.waitForSelector(".pane.is-focused .cm-editor");
  await page
    .locator(".pane.is-focused .cm-scroller")
    .evaluate((element) => {
      element.scrollTop = 0;
    });
  await page.getByTestId("outline-toggle").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".outline-item").length >= 4,
    { timeout: 5000 },
  );
  await page.locator(".outline-item", { hasText: "外部修改" }).click();
  await page.waitForTimeout(500);
  const editorScroll = await page
    .locator(".pane.is-focused .cm-scroller")
    .evaluate((element) => element.scrollTop);
  if (editorScroll <= 0) throw new Error("outline jump did not scroll the editor");
  await page.getByTestId("outline-toggle").click();

  await page.getByTestId("split-menu").click();
  await page.getByRole("menuitem", { name: "向右拆分" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".pane").length === 2);
  await page.getByTestId("tab").filter({ hasText: "image-note.md" }).click();
  await page.getByTestId("mode-toggle").click();
  await page.waitForSelector(".preview img");
  await page.waitForFunction(() => {
    const image = document.querySelector(".preview img");
    return Boolean(image && image.complete && image.naturalWidth > 0);
  });
  const imageLoaded = await page
    .locator(".preview img")
    .evaluate((image) => image.complete && image.naturalWidth > 0);
  if (!imageLoaded) throw new Error("relative image did not load through /media");
  await page.locator(".preview img").click();
  await page.waitForSelector("[data-testid='lightbox']:not([hidden])");
  await page.waitForSelector(".lightbox-media");
  await page.locator(".lightbox-media").click();
  if (!(await page.locator(".lightbox-media").evaluate((image) => image.classList.contains("is-actual")))) {
    throw new Error("image lightbox did not zoom to actual size");
  }
  await shot(page, "04b-lightbox.png");
  await page.getByTestId("lightbox-close").click();
  if ((await page.locator("[data-testid='lightbox']:not([hidden])").count()) !== 0) {
    throw new Error("lightbox did not close");
  }
  await page.locator(".preview img").click();
  await page.waitForSelector("[data-testid='lightbox']:not([hidden])");
  await page.keyboard.press("Escape");
  if ((await page.locator("[data-testid='lightbox']:not([hidden])").count()) !== 0) {
    throw new Error("Escape did not close the lightbox");
  }
  await page.locator(".md-video video").scrollIntoViewIfNeeded();
  await page.locator(".md-video video").click({ force: true });
  await page.waitForSelector("[data-testid='lightbox']:not([hidden])");
  if ((await page.locator("[data-testid='lightbox'] video").count()) !== 1) {
    throw new Error("video was not enlarged in the lightbox");
  }
  await page.getByTestId("lightbox-close").click();
  await shot(page, "04-split-read-light.png");

  const paneCountBefore = await page.locator(".pane").count();
  if (paneCountBefore !== 2) throw new Error("split did not create two panes");
  const leftPane = page.locator(".pane").first();
  const leftBox = await leftPane.boundingBox();
  const fieldTab = page.getByTestId("tab").filter({ hasText: "field-notes.md" });
  const fieldBox = await fieldTab.boundingBox();
  if (!leftBox || !fieldBox) throw new Error("missing drag geometry");
  await page.mouse.move(fieldBox.x + fieldBox.width / 2, fieldBox.y + fieldBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    leftBox.x + leftBox.width / 2,
    leftBox.y + leftBox.height - 50,
    { steps: 14 },
  );
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(shots, "05-drag-hint.png") });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelectorAll(".pane").length === 3);
  await page.getByTestId("tab").filter({ hasText: "field-notes.md" }).click();
  await page.waitForTimeout(200);
  await shot(page, "06-three-panes-dark.png");

  const rootDivider = page.locator(".split[data-dir='row'] > .split-divider").first();
  const dividerBox = await rootDivider.boundingBox();
  const firstPane = page.locator(".pane").first();
  const widthBefore = (await firstPane.boundingBox())?.width ?? 0;
  if (!dividerBox) throw new Error("no divider");
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + 60);
  await page.mouse.down();
  await page.mouse.move(dividerBox.x - 90, dividerBox.y + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const widthAfter = (await firstPane.boundingBox())?.width ?? 0;
  if (Math.abs(widthAfter - widthBefore) < 30) {
    throw new Error("divider drag did not resize the panes");
  }
  await shot(page, "07-resized.png");

  await page.getByTestId("new-tab").click();
  await page.getByRole("menuitem", { name: "新建文档" }).click();
  await page.waitForTimeout(250);
  await page.locator(".pane.is-focused .cm-content").click();
  await page.keyboard.insertText("这是一段尚未保存的文字。");
  const untitledTab = page.locator(".tab.is-active");
  await untitledTab.getByLabel("关闭标签页").click();
  await page.waitForSelector("[data-testid='unsaved-dialog']");
  await page.getByRole("button", { name: "取消" }).click();
  await page.waitForTimeout(250);
  if ((await page.getByTestId("tab").count()) !== 4) {
    throw new Error("cancel closed the unsaved tab");
  }
  await page.locator(".tab.is-active").getByLabel("关闭标签页").click();
  await page.waitForSelector("[data-testid='unsaved-dialog']");
  await page.getByRole("button", { name: "不保存" }).click();
  await page.waitForTimeout(300);
  if ((await page.getByTestId("tab").count()) !== 3) {
    throw new Error("discard did not close the untitled tab");
  }

  await page.waitForTimeout(800);
  await closeApp(page);

  child = startApp([]);
  page = await connect();
  const restoredTabs = await page.getByTestId("tab").count();
  if (restoredTabs < 3) throw new Error(`session restored ${restoredTabs} tabs`);
  await page.locator('[data-testid="tab"][title="notes.md"]').click();
  await page.waitForTimeout(300);
  if ((await page.locator(".pane.is-focused .cm-content").count()) === 0) {
    await page.getByTestId("mode-toggle").click();
  }
  await page.locator(".pane.is-focused .cm-content").click();
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(250);
  const restoredText = await page.locator(".pane.is-focused .cm-content").innerText();
  if (!restoredText.includes("自动保存")) {
    throw new Error("restored document did not retain saved content");
  }
  await page.keyboard.press("Control+Home");
  await page.waitForTimeout(250);
  await page.emulateMedia({ colorScheme: "light" });
  await shot(page, "08-restored-light.png");

  while ((await page.getByTestId("tab").count()) > 0) {
    await page.getByTestId("tab").first().getByLabel("关闭标签页").click();
    await page.waitForTimeout(220);
  }
  await page.waitForSelector("[data-testid='welcome']:not([hidden])");
  await page.getByTestId("welcome-new").click();
  await page.waitForSelector(".cm-editor");
  if ((await page.locator(".pane").count()) !== 1) {
    throw new Error("new document did not reset to a single pane");
  }
  await shot(page, "09-new-after-empty.png");

  console.log(
    JSON.stringify(
      {
        autosave: true,
        panes: 3,
        image: true,
        dragSplit: true,
        resize: Math.round(widthAfter - widthBefore),
        sessionTabs: restoredTabs,
        emptyReset: true,
        errors,
      },
      null,
      2,
    ),
  );
  await closeApp(page);
} catch (error) {
  console.error(error);
  if (child) {
    try {
      child.kill();
    } catch {
      /* noop */
    }
  }
  if (browser) await browser.close().catch(() => {});
  process.exitCode = 1;
}

if (errors.length) process.exitCode = 1;
