import { describe, expect, it } from "vitest";
import {
  basename,
  dirname,
  isMarkdownPath,
  normalizePath,
  resolveRelative,
  samePath,
  suggestedName,
  toMediaUrl,
} from "../src/core/paths";
import { renderMarkdown } from "../src/core/markdown";

describe("paths", () => {
  it("handles Windows file names and directories", () => {
    expect(basename("C:\\notes\\paper.md")).toBe("paper.md");
    expect(dirname("C:\\notes\\paper.md")).toBe("C:/notes");
    expect(normalizePath("C:\\notes\\..\\papers\\today.md")).toBe(
      "C:/papers/today.md",
    );
  });

  it("resolves relative links and images against the document", () => {
    expect(resolveRelative("C:\\notes\\today.md", "./images/paper.png")).toBe(
      "C:/notes/images/paper.png",
    );
    expect(resolveRelative("C:\\notes\\today.md", "../archive/old.md")).toBe(
      "C:/archive/old.md",
    );
    expect(resolveRelative("C:\\notes\\today.md", "https://example.com")).toBeNull();
  });

  it("compares paths case-insensitively and builds media URLs", () => {
    expect(samePath("C:\\Notes\\A.md", "c:/notes/a.md")).toBe(true);
    expect(isMarkdownPath("note.markdown")).toBe(true);
    expect(isMarkdownPath("photo.png")).toBe(false);
    expect(toMediaUrl("C:\\notes\\a b.png")).toContain(
      encodeURIComponent("C:\\notes\\a b.png"),
    );
    expect(suggestedName("未命名")).toBe("未命名.md");
    expect(suggestedName("note.md")).toBe("note.md");
  });
});

describe("markdown rendering", () => {
  it("renders the expected document structure", () => {
    const html = renderMarkdown(
      "# 标题\n\n**粗体** 与 `代码`\n\n- 一项\n- 另一项\n\n> 引用\n",
      null,
    );
    expect(html).toContain("<h1 id=\"标题\">标题</h1>");
    expect(html).toContain("<strong>粗体</strong>");
    expect(html).toContain("<code>代码</code>");
    expect(html).toContain("<blockquote>");
  });

  it("makes relative images local and leaves external links external", () => {
    const html = renderMarkdown(
      "![图](./image.png)\n\n[网站](https://example.com)",
      "C:\\notes\\note.md",
    );
    expect(html).toContain("/media?path=");
    expect(html).toContain("data-external=\"https://example.com\"");
  });

  it("generates unique heading ids", () => {
    const html = renderMarkdown("## 重复\n\n## 重复\n", null);
    expect(html).toContain('id="重复"');
    expect(html).toContain('id="重复-2"');
  });

  it("does not allow raw html", () => {
    const html = renderMarkdown("<script>alert(1)</script>", null);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders inline and display math with KaTeX", () => {
    const inline = renderMarkdown("质能方程 $E = mc^2$。", null);
    expect(inline).toContain("katex");
    expect(inline).toContain("math-inline");

    const spaced = renderMarkdown("质能方程 $ E = mc^2 $。", null);
    expect(spaced).toContain("katex");

    const block = renderMarkdown("$$\n\\frac{1}{2}\n$$", null);
    expect(block).toContain("math-block");
    expect(block).toContain("katex-display");
  });

  it("does not treat code, escaped dollars or currency as math", () => {
    expect(renderMarkdown("`$x$`", null)).not.toContain("katex");
    expect(renderMarkdown("\\$x\\$", null)).not.toContain("katex");
    expect(renderMarkdown("价格是 $5 and $10。", null)).not.toContain("katex");
  });
});
