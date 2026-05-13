import type { PackageRepoDiffFile, RepoTreeEntry, SourceRecord } from "../types";

export function sourceMatchesQuery(source: SourceRecord, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [source.repo, ...source.packageNames].some((value) => value.toLowerCase().includes(normalized));
}

export function parentPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function buildBreadcrumbs(path: string): Array<{ label: string; path: string }> {
  const parts = path.split("/").filter(Boolean);
  const crumbs: Array<{ label: string; path: string }> = [];
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    crumbs.push({ label: part, path: current });
  }
  return crumbs;
}

export function sortTreeEntries(entries: RepoTreeEntry[]): RepoTreeEntry[] {
  return [...entries].sort((left, right) => {
    if (left.type !== right.type) return left.type === "tree" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

export function diffStatusClass(status: PackageRepoDiffFile["status"]): string {
  if (status === "added") return "is-enabled";
  if (status === "deleted") return "is-disabled";
  return "is-update";
}

export function labelForDiffStatus(status: PackageRepoDiffFile["status"]): string {
  if (status === "added") return "Added";
  if (status === "deleted") return "Deleted";
  return "Modified";
}

export function prefixForDiffLine(tag: string): string {
  if (tag === "add") return "+";
  if (tag === "delete") return "-";
  if (tag === "binary") return "#";
  return " ";
}

export function highlightLine(path: string, content: string): Array<{ text: string; className: string }> {
  const language = languageForPath(path);
  if (language === "plain" || content.trim().length === 0) {
    return [{ text: content, className: "" }];
  }
  const pattern = language === "css"
    ? /(\/\*.*?\*\/|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|#[a-fA-F0-9]{3,8}\b|\b(?:@media|@supports|display|grid|flex|color|background|border|padding|margin|font|width|height|min|max|gap|content)\b|-?\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw)?\b)/g
    : /(\/\/.*$|\/\*.*?\*\/|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`|\b(?:import|export|from|type|const|let|var|function|return|if|else|for|while|class|extends|async|await|try|catch|throw|new|true|false|null|undefined)\b|-?\b\d+(?:\.\d+)?\b)/g;
  const tokens: Array<{ text: string; className: string }> = [];
  let index = 0;
  for (const match of content.matchAll(pattern)) {
    const text = match[0];
    const start = match.index ?? 0;
    if (start > index) {
      tokens.push({ text: content.slice(index, start), className: "" });
    }
    tokens.push({ text, className: tokenClass(text) });
    index = start + text.length;
  }
  if (index < content.length) {
    tokens.push({ text: content.slice(index), className: "" });
  }
  return tokens;
}

function languageForPath(path: string): "js" | "css" | "plain" {
  if (/\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(path)) return "js";
  if (/\.(css|scss|less)$/.test(path)) return "css";
  return "plain";
}

function tokenClass(token: string): string {
  if (/^(\/\/|\/\*)/.test(token)) return "tok-comment";
  if (/^["'`]/.test(token)) return "tok-string";
  if (/^-?\d/.test(token) || /^#[a-fA-F0-9]/.test(token)) return "tok-number";
  return "tok-keyword";
}
