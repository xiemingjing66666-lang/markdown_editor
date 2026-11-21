export function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index === -1) return "";
  if (index === 0) return "/";
  if (/^[a-zA-Z]:$/.test(normalized.slice(0, index))) return `${normalized.slice(0, index)}/`;
  return normalized.slice(0, index);
}

export function isAbsolutePath(filePath: string): boolean {
  return (
    /^[a-zA-Z]:[\\/]/.test(filePath) ||
    filePath.startsWith("\\\\") ||
    filePath.startsWith("/")
  );
}

export function normalizePath(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  const output: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      if (output.length > 1) output.pop();
      continue;
    }
    output.push(part);
  }
  const prefix = /^[a-zA-Z]:/.test(filePath) ? "" : "/";
  return prefix + output.join("/");
}

export function samePath(a: string, b: string): boolean {
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase();
}

export function resolveRelative(baseFile: string, reference: string): string | null {
  let raw = reference;
  try {
    raw = decodeURIComponent(reference);
  } catch {
    raw = reference;
  }
  const pathOnly = raw.split("#")[0]?.split("?")[0] ?? raw;
  if (!pathOnly) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(pathOnly) && !/^[a-zA-Z]:[\\/]/.test(pathOnly)) {
    return null;
  }
  if (pathOnly.startsWith("//")) return null;
  if (isAbsolutePath(pathOnly)) return pathOnly.replace(/\//g, "\\");
  const base = dirname(baseFile);
  if (!base) return null;
  return normalizePath(`${base}/${pathOnly}`);
}

export function toMediaUrl(absolutePath: string): string {
  return `/media?path=${encodeURIComponent(absolutePath)}`;
}

export function isMarkdownPath(filePath: string): boolean {
  return /\.(md|markdown|mdown|mdx|txt)$/i.test(filePath);
}

export function suggestedName(name: string): string {
  if (!name || name === "未命名") return "未命名.md";
  if (/\.[a-z0-9]{1,8}$/i.test(name)) return name;
  return `${name}.md`;
}

export function stripExtension(name: string): string {
  return name.replace(/\.(md|markdown|mdown|mdx|txt)$/i, "");
}
