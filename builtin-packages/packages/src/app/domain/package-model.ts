import type {
  CatalogEntry,
  CatalogRecord,
  PackageRecord,
  PackagesState,
  PackagesView,
  PackageScopeFilter,
} from "../types";

export function formatScope(pkg: PackageRecord): string {
  if (pkg.scope.kind === "user") return "Mine";
  if (pkg.scope.kind === "workspace") return `Workspace:${pkg.scope.workspaceId ?? "?"}`;
  return "System";
}

export function sourcePathForPackage(pkg: PackageRecord): string {
  return `/src/packages/${packageSourcePathName(pkg.name)}`;
}

export function packageSourcePathName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function packageSurfaceCounts(pkg: PackageRecord) {
  const ui = pkg.entrypoints.filter((entry) => entry.kind === "ui").length;
  const command = pkg.entrypoints.filter((entry) => entry.kind === "command").length;
  const rpc = pkg.entrypoints.filter((entry) => entry.kind === "rpc").length;
  const http = pkg.entrypoints.filter((entry) => entry.kind === "http").length;
  const profile = pkg.profiles.length;
  return {
    ui,
    command,
    rpc,
    http,
    profile,
    total: ui + command + rpc + http + profile,
  };
}

export function surfaceTitle(kind: "ui" | "command" | "rpc" | "http" | "profile", count: number): string {
  if (kind === "ui") return `${count} app window${count === 1 ? "" : "s"}`;
  if (kind === "command") return `${count} CLI command${count === 1 ? "" : "s"}`;
  if (kind === "profile") return `${count} AI profile${count === 1 ? "" : "s"}`;
  if (kind === "http") return `${count} HTTP surface${count === 1 ? "" : "s"}`;
  return `${count} RPC surface${count === 1 ? "" : "s"}`;
}

export function parseRepoSlug(repo: string): { owner: string; name: string } {
  const [owner, ...rest] = repo.split("/").filter(Boolean);
  return {
    owner: owner || "unknown",
    name: rest.join("/") || repo || "unknown",
  };
}

export function formatRepoDisplay(repo: string, viewerUsername: string): string {
  const { owner, name } = parseRepoSlug(repo);
  return `${owner === viewerUsername ? "you" : owner} / ${name}`;
}

export function createRepoName(raw: string): string {
  const value = raw.trim().replace(/^\/+|\/+$/g, "");
  const parts = value.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? value;
}

export function packageMatchesScope(pkg: PackageRecord, scope: PackageScopeFilter): boolean {
  if (scope === "mine") return pkg.scope.kind === "user";
  if (scope === "system") return pkg.scope.kind === "global";
  return true;
}

export function packageMatchesView(pkg: PackageRecord, view: PackagesView): boolean {
  if (view === "updates") return pkg.updateAvailable;
  if (view === "review") return pkg.reviewPending;
  return view === "inventory";
}

export function packageMatchesQuery(pkg: PackageRecord, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    pkg.name,
    pkg.description,
    pkg.source.repo,
    pkg.source.ref,
    ...pkg.bindingNames,
    ...pkg.declaredSyscalls,
  ].some((value) => value.toLowerCase().includes(normalized));
}

export function comparePackagesForView(view: PackagesView) {
  return (left: PackageRecord, right: PackageRecord) => {
    if (view === "updates") {
      return Number(right.updateAvailable) - Number(left.updateAvailable) || right.updatedAt - left.updatedAt || left.name.localeCompare(right.name);
    }
    if (view === "review") {
      return Number(right.reviewPending) - Number(left.reviewPending) || left.name.localeCompare(right.name);
    }
    const leftScore = (left.reviewPending ? 3 : 0) + (left.updateAvailable ? 2 : 0) + (!left.enabled ? 1 : 0);
    const rightScore = (right.reviewPending ? 3 : 0) + (right.updateAvailable ? 2 : 0) + (!right.enabled ? 1 : 0);
    return rightScore - leftScore || left.name.localeCompare(right.name);
  };
}

export function statusClass(pkg: PackageRecord): string {
  if (pkg.reviewPending) return "is-review";
  if (pkg.updateAvailable) return "is-update";
  if (pkg.enabled) return "is-enabled";
  return "is-disabled";
}

export function viewTitle(view: PackagesView): string {
  if (view === "updates") return "Available updates";
  if (view === "review") return "Packages needing review";
  return "Installed packages";
}

export function viewDescription(view: PackagesView): string {
  if (view === "updates") return "Packages whose source heads moved ahead of the installed commit.";
  if (view === "review") return "Packages that still need a trust decision before enablement.";
  return "Operational inventory of software installed in this GSV instance.";
}

export function catalogPackageCount(state: PackagesState | null): number {
  return (state?.catalogs ?? []).reduce((total, catalog) => total + catalog.packages.length, 0);
}

export function buildPermissionSummary(pkg: PackageRecord): string[] {
  const notes = new Set<string>();
  if (pkg.bindingNames.includes("KERNEL")) notes.add("Can call kernel-backed app RPC through the package runtime bridge.");
  if (pkg.declaredSyscalls.some((syscall) => syscall.startsWith("shell."))) notes.add("Can execute shell commands on a control target or routed device.");
  if (pkg.declaredSyscalls.some((syscall) => syscall.startsWith("fs."))) notes.add("Can read or modify files exposed through filesystem syscalls.");
  if (pkg.declaredSyscalls.includes("proc.spawn")) notes.add("Can spawn new processes and route work into more runtime contexts.");
  if (pkg.declaredSyscalls.some((syscall) => syscall.startsWith("pkg."))) notes.add("Can inspect or change package state, including install or update flows.");
  if (pkg.declaredSyscalls.some((syscall) => syscall.startsWith("sys.config."))) notes.add("Can modify system configuration.");
  if (pkg.declaredSyscalls.some((syscall) => syscall.startsWith("sys.token."))) notes.add("Can issue or revoke access tokens.");
  if (pkg.declaredSyscalls.some((syscall) => syscall.startsWith("sys.link") || syscall.startsWith("sys.unlink"))) notes.add("Can modify identity links and trust relationships.");
  if (notes.size === 0) notes.add("No elevated bindings or syscall surfaces were declared in the package summary.");
  return [...notes];
}

export function packageRiskLevel(pkg: PackageRecord): "low" | "medium" | "high" {
  if (pkg.declaredSyscalls.some((syscall) => syscall.startsWith("shell.") || syscall.startsWith("fs.") || syscall.startsWith("pkg.") || syscall.startsWith("sys.") || syscall === "proc.spawn")) {
    return "high";
  }
  if (pkg.bindingNames.includes("KERNEL") || pkg.declaredSyscalls.length > 0) {
    return "medium";
  }
  return "low";
}

export function packageRiskLabel(pkg: PackageRecord): string {
  const level = packageRiskLevel(pkg);
  if (level === "high") return "High risk";
  if (level === "medium") return "Medium risk";
  return "Low risk";
}

export function packageRiskDescription(pkg: PackageRecord): string {
  const level = packageRiskLevel(pkg);
  if (level === "high") return "This package declares access to privileged runtime surfaces. Review source and diffs before approval.";
  if (level === "medium") return "This package has runtime bridge or syscall exposure. Confirm the declared surfaces match its job.";
  return "This package declares no elevated syscall or binding surface in the package summary.";
}

export function buildRefOptions(state: PackagesState["packageDetail"] | null | undefined, fallback?: string): string[] {
  const refs = state ? [...Object.keys(state.refs.heads), ...Object.keys(state.refs.tags)] : [];
  if (fallback) refs.push(fallback);
  return unique(refs).sort((left, right) => left.localeCompare(right));
}

export function matchInstalledPackage(entry: CatalogEntry, packages: PackageRecord[]): PackageRecord | null {
  return packages.find((pkg) => pkg.source.repo === entry.source.repo && pkg.source.subdir === entry.source.subdir) ?? null;
}

export function catalogImportSource(catalog: CatalogRecord, entry: CatalogEntry): string {
  if (catalog.kind === "remote" && catalog.baseUrl) {
    const [owner, repo] = entry.source.repo.split("/");
    if (owner && repo) {
      return `${catalog.baseUrl.replace(/\/+$/g, "")}/git/${owner}/${repo}.git`;
    }
  }
  return entry.source.repo;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
