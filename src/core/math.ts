import katex from "katex";
import type MarkdownIt from "markdown-it";

function renderMath(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    strict: "ignore",
    trust: false,
    output: "htmlAndMathml",
    errorColor: "#c25438",
  });
}

/**
 * Adds `$...$`, `$$...$$`, `\(...\)` and `\[...\]` math without turning
 * currency-looking dollars into formulas: inline delimiters must touch their
 * content, while display math is line based.
 */
export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("escape", "math_inline", (state, silent) => {
    const start = state.pos;
    const src = state.src;
    const first = src.charAt(start);

    if (first === "\\" && src.charAt(start + 1) === "(") {
      const end = src.indexOf("\\)", start + 2);
      if (end < 0) return false;
      const content = src.slice(start + 2, end);
      if (!content.trim()) return false;
      if (!silent) {
        const token = state.push("math_inline", "math", 0);
        token.markup = "\\(";
        token.content = content;
      }
      state.pos = end + 2;
      return true;
    }

    if (first !== "$" || src.charAt(start + 1) === "$") return false;
    if (start + 1 >= state.posMax) return false;
    const openingSpace = /\s/.test(src.charAt(start + 1));

    let cursor = start + 1;
    while (cursor < state.posMax) {
      const character = src.charAt(cursor);
      if (character === "\\") {
        cursor += 2;
        continue;
      }
      if (character === "\n") return false;
      if (character === "$") {
        const content = src.slice(start + 1, cursor);
        if (!content.trim()) return false;
        if (
          (openingSpace || /\s/.test(src.charAt(cursor - 1))) &&
          !/[\\^_=+\-*/<>()[\]{}]/.test(content)
        ) {
          return false;
        }
        if (!silent) {
          const token = state.push("math_inline", "math", 0);
          token.markup = "$";
          token.content = content;
        }
        state.pos = cursor + 1;
        return true;
      }
      cursor += 1;
    }
    return false;
  });

  md.block.ruler.before(
    "fence",
    "math_block",
    (state, startLine, endLine, silent) => {
      const start = state.bMarks[startLine]! + state.tShift[startLine]!;
      const max = state.eMarks[startLine]!;
      const firstLine = state.src.slice(start, max);
      let close = "";
      let content = "";
      let nextLine = startLine + 1;

      if (firstLine.startsWith("$$")) {
        close = "$$";
        content = firstLine.slice(2);
      } else if (firstLine.startsWith("\\[")) {
        close = "\\]";
        content = firstLine.slice(2);
      } else {
        return false;
      }

      const trimmed = content.trimEnd();
      if (trimmed.endsWith(close)) {
        content = trimmed.slice(0, -close.length);
      } else {
        if (content.trim() !== "") return false;
        const lines: string[] = [];
        let closed = false;
        for (let line = nextLine; line < endLine; line += 1) {
          const lineStart = state.bMarks[line]! + state.tShift[line]!;
          const lineEnd = state.eMarks[line]!;
          const text = state.src.slice(lineStart, lineEnd);
          const lineTrimmed = text.trimEnd();
          if (lineTrimmed.endsWith(close)) {
            lines.push(lineTrimmed.slice(0, -close.length));
            nextLine = line + 1;
            closed = true;
            break;
          }
          lines.push(text);
        }
        if (!closed) return false;
        content = lines.join("\n");
      }

      if (!content.trim()) return false;
      if (!silent) {
        const token = state.push("math_block", "math", 0);
        token.block = true;
        token.markup = close;
        token.content = content;
        token.map = [startLine, nextLine];
        state.line = nextLine;
      }
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );

  md.renderer.rules.math_inline = (tokens, index) => {
    const token = tokens[index];
    if (!token) return "";
    return `<span class="math-inline">${renderMath(token.content, false)}</span>`;
  };
  md.renderer.rules.math_block = (tokens, index) => {
    const token = tokens[index];
    if (!token) return "";
    return `<div class="math-block">${renderMath(token.content, true)}</div>\n`;
  };
}
