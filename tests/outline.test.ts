import { describe, expect, it } from "vitest";
import { extractHeadings, renderMarkdown } from "../src/core/markdown";

describe("outline extraction", () => {
  it("keeps levels, text and source lines", () => {
    const headings = extractHeadings("# 一\n\n正文\n\n## 二\n\n### 三\n");
    expect(headings.map((heading) => heading.level)).toEqual([1, 2, 3]);
    expect(headings.map((heading) => heading.text)).toEqual(["一", "二", "三"]);
    expect(headings.map((heading) => heading.line)).toEqual([0, 4, 6]);
    expect(headings.map((heading) => heading.id)).toEqual(["一", "二", "三"]);
  });

  it("deduplicates ids the same way as rendering", () => {
    const headings = extractHeadings("## 重复\n\n## 重复\n\n# 重复\n");
    expect(headings.map((heading) => heading.id)).toEqual([
      "重复",
      "重复-2",
      "重复-3",
    ]);
  });

  it("ignores code blocks and code spans", () => {
    const headings = extractHeadings(
      "# 标题\n\n```md\n# 不是标题\n```\n\n`## 也不是标题`\n",
    );
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text).toBe("标题");
  });

  it("supports setext headings and inline formatting", () => {
    const headings = extractHeadings("一级标题\n===\n\n二级 **粗体**\n---\n");
    expect(headings).toHaveLength(2);
    expect(headings[0]).toMatchObject({ level: 1, text: "一级标题" });
    expect(headings[1]).toMatchObject({ level: 2, text: "二级 粗体" });
  });

  it("generates the same ids as the rendered preview", () => {
    const text = "# 标题\n\n## 重复\n\n## 重复\n\n### 公式 $x^2$";
    const headings = extractHeadings(text);
    const html = renderMarkdown(text, null);
    for (const heading of headings) {
      expect(html).toContain(`id="${heading.id}"`);
    }
  });
});
