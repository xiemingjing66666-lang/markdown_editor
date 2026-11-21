import MarkdownIt from "markdown-it";
import {
  isAbsolutePath,
  resolveRelative,
  toMediaUrl,
} from "./paths";
import { mathPlugin } from "./math";

export interface RenderEnvironment {
  docPath: string | null;
  slugCounts: Map<string, number>;
}

export interface OutlineHeading {
  id: string;
  level: number;
  text: string;
  /** Zero-based source line. */
  line: number;
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
});

mathPlugin(md);

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[`*_~#[\]()>]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return slug || "section";
}

md.renderer.rules.heading_open = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const next = tokens[index + 1];
  if (token && next) {
    const base = slugify(next.content);
    const environment = env as RenderEnvironment;
    const count = environment.slugCounts.get(base) ?? 0;
    environment.slugCounts.set(base, count + 1);
    token.attrSet("id", count === 0 ? base : `${base}-${count + 1}`);
  }
  return self.renderToken(tokens, index, options);
};

md.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const environment = env as RenderEnvironment;
  if (!token) return "";
  const source = token.attrGet("src") ?? "";
  if (source && !/^(https?:|data:|blob:|paperleaf:)/i.test(source)) {
    if (!environment.docPath) {
      const alt = token.content || "图片";
      return `<span class="md-image-missing">${md.utils.escapeHtml(alt)}</span>`;
    }
    const absolute = isAbsolutePath(source)
      ? source
      : resolveRelative(environment.docPath, source);
    if (absolute) token.attrSet("src", toMediaUrl(absolute));
  }
  token.attrSet("loading", "lazy");
  token.attrSet("decoding", "async");
  return self.renderToken(tokens, index, options);
};

const defaultLinkOpen = md.renderer.rules.link_open;
md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const href = token?.attrGet("href") ?? "";
  const environment = env as RenderEnvironment;
  if (token) {
    if (/^https?:/i.test(href)) {
      token.attrSet("data-external", href);
    } else if (href.startsWith("#")) {
      token.attrSet("data-anchor", href.slice(1));
    } else if (environment.docPath && href) {
      const absolute = resolveRelative(environment.docPath, href);
      if (absolute) token.attrSet("data-local-path", absolute);
    }
  }
  return defaultLinkOpen
    ? defaultLinkOpen(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options);
};

export function renderMarkdown(text: string, docPath: string | null): string {
  const env: RenderEnvironment = {
    docPath,
    slugCounts: new Map(),
  };
  return md.render(text, env);
}

export function extractHeadings(text: string): OutlineHeading[] {
  const env: RenderEnvironment = {
    docPath: null,
    slugCounts: new Map(),
  };
  const tokens = md.parse(text, env);
  const headings: OutlineHeading[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token.type !== "heading_open") continue;
    const inline = tokens[index + 1];
    const level = Number(token.tag.slice(1));
    const base = slugify(inline?.content ?? "");
    const count = env.slugCounts.get(base) ?? 0;
    env.slugCounts.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    const textContent = (inline?.children ?? [])
      .map((child) => {
        if (
          child.type === "text" ||
          child.type === "code_inline" ||
          child.type === "math_inline" ||
          child.type === "image"
        ) {
          return child.content;
        }
        if (child.type === "softbreak" || child.type === "hardbreak") return " ";
        return "";
      })
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    const display = textContent || (inline?.content ?? "").replace(/[*_`~]/g, "").trim();
    if (display) {
      headings.push({ id, level, text: display, line: token.map?.[0] ?? 0 });
    }
  }
  return headings;
}
