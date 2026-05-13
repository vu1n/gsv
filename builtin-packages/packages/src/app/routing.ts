import type { PackageDetailTab, PackageScopeFilter, PackagesView } from "./types";

export function readViewFromLocation(): PackagesView {
  const value = new URL(window.location.href).searchParams.get("view");
  if (value === "installed") return "inventory";
  return value === "updates" || value === "review" || value === "sources" || value === "discover" || value === "remotes" || value === "create"
    ? value
    : "inventory";
}

export function readScopeFromLocation(): PackageScopeFilter {
  const value = new URL(window.location.href).searchParams.get("scope");
  return value === "mine" || value === "system" ? value : "all";
}

export function readTabFromLocation(): PackageDetailTab {
  const value = new URL(window.location.href).searchParams.get("tab");
  if (value === "code" || value === "commits" || value === "changes") return "source";
  if (value === "overview") return "summary";
  return value === "source" || value === "permissions" || value === "review" ? value : "summary";
}

export function readPackageIdFromLocation(): string | null {
  const value = new URL(window.location.href).searchParams.get("package");
  return value && value.trim() ? value.trim() : null;
}

export function readSourceFromLocation(): string | null {
  const value = new URL(window.location.href).searchParams.get("source");
  return value && value.trim() ? value.trim() : null;
}

export function readCatalogFromLocation(): string {
  const value = new URL(window.location.href).searchParams.get("catalog");
  return value && value.trim() ? value.trim() : "local";
}

export function appIdFromRoute(route: string): string {
  const match = route.match(/\/apps\/([^/?#]+)/);
  return match?.[1] ?? "";
}
