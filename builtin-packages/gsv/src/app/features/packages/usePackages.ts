import { useEffect, useMemo, useState } from "preact/hooks";
import type { GsvBackend } from "../../backend";
import { errorToText } from "../../utils/format";
import { filteredPackages } from "./packages-domain";
import type { PackageRecord, PackageScopeFilter, PackagesState, PackagesView } from "./types";

export type PackagesRuntime = {
  state: PackagesState | null;
  loading: boolean;
  error: string | null;
  view: PackagesView;
  scope: PackageScopeFilter;
  query: string;
  selectedPackageId: string | null;
  selectedPackage: PackageRecord | null;
  visiblePackages: PackageRecord[];
  setView(view: PackagesView): void;
  setScope(scope: PackageScopeFilter): void;
  setQuery(query: string): void;
  selectPackage(packageId: string | null): void;
  refresh(): Promise<void>;
};

export function usePackages(backend: GsvBackend): PackagesRuntime {
  const [state, setState] = useState<PackagesState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setViewState] = useState<PackagesView>(readViewFromLocation);
  const [scope, setScopeState] = useState<PackageScopeFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(readPackageFromLocation);

  const selectedPackage = useMemo(
    () => state?.packages.find((pkg) => pkg.packageId === selectedPackageId) ?? null,
    [selectedPackageId, state],
  );

  const visiblePackages = useMemo(
    () => state ? filteredPackages(state, view, scope, query) : [],
    [query, scope, state, view],
  );

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!state || state.packages.length === 0) {
      if (selectedPackageId !== null) {
        selectPackage(null);
      }
      return;
    }
    if (visiblePackages.length === 0) {
      if (selectedPackageId !== null) {
        selectPackage(null);
      }
      return;
    }
    if (!selectedPackageId || !visiblePackages.some((pkg) => pkg.packageId === selectedPackageId)) {
      selectPackage(visiblePackages[0].packageId);
    }
  }, [selectedPackageId, state, visiblePackages]);

  async function refresh(packageId = selectedPackageId ?? undefined): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const nextState = await backend.loadPackagesState({ packageId });
      setState(nextState);
    } catch (cause) {
      setError(errorToText(cause));
    } finally {
      setLoading(false);
    }
  }

  function setView(nextView: PackagesView): void {
    setViewState(nextView);
    const url = new URL(window.location.href);
    url.searchParams.set("section", "packages");
    url.searchParams.set("view", nextView);
    window.history.replaceState({}, "", url);
  }

  function setScope(nextScope: PackageScopeFilter): void {
    setScopeState(nextScope);
  }

  function selectPackage(packageId: string | null): void {
    setSelectedPackageId(packageId);
    const url = new URL(window.location.href);
    url.searchParams.set("section", "packages");
    if (packageId) {
      url.searchParams.set("package", packageId);
    } else {
      url.searchParams.delete("package");
    }
    window.history.replaceState({}, "", url);
    if (packageId) {
      void refresh(packageId);
    }
  }

  return {
    state,
    loading,
    error,
    view,
    scope,
    query,
    selectedPackageId,
    selectedPackage,
    visiblePackages,
    setView,
    setScope,
    setQuery,
    selectPackage,
    refresh,
  };
}

function readViewFromLocation(): PackagesView {
  const value = new URL(window.location.href).searchParams.get("view");
  return value === "updates" || value === "review" ? value : "inventory";
}

function readPackageFromLocation(): string | null {
  const value = new URL(window.location.href).searchParams.get("package");
  return value?.trim() || null;
}
