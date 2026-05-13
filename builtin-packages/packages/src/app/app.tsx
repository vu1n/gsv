import { openApp } from "@gsv/package/host";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import {
  PackageBadges,
  RepoSlug,
  TimeAgo,
} from "./components/package-ui";
import { InventoryPanel, PackageInventoryTable } from "./components/inventory-panel";
import { InfoItem, PackageDetailView } from "./components/package-detail-view";
import {
  buildRefOptions,
  catalogImportSource,
  catalogPackageCount,
  comparePackagesForView,
  createRepoName,
  formatRepoDisplay,
  matchInstalledPackage,
  packageMatchesQuery,
  packageMatchesScope,
  packageMatchesView,
  statusClass,
} from "./domain/package-model";
import {
  sourceMatchesQuery,
} from "./domain/source-model";
import {
  readCatalogFromLocation,
  readPackageIdFromLocation,
  readScopeFromLocation,
  readSourceFromLocation,
  readTabFromLocation,
  readViewFromLocation,
} from "./routing";
import type {
  CatalogEntry,
  CatalogRecord,
  PackageCreateTemplate,
  PackageDetailTab,
  PackageRecord,
  PackageRepoDiffResult,
  PackageRepoReadResult,
  PackageRepoRoot,
  PackageRepoSearchResult,
  PackagesBackend,
  PackagesState,
  PackagesView,
  PackageScopeFilter,
  SourceRecord,
} from "./types";
import { formatError } from "./utils/format";

type AppProps = {
  backend: PackagesBackend;
};

type CreatePackageForm = {
  repo: string;
  packageName: string;
  displayName: string;
  description: string;
  template: PackageCreateTemplate;
  command: string;
  ref: string;
  subdir: string;
  enable: boolean;
  overwrite: boolean;
};

const DEFAULT_CREATE_FORM: CreatePackageForm = {
  repo: "",
  packageName: "",
  displayName: "",
  description: "",
  template: "web-ui",
  command: "",
  ref: "main",
  subdir: ".",
  enable: false,
  overwrite: false,
};

export function App({ backend }: AppProps) {
  const [state, setState] = useState<PackagesState | null>(null);
  const [view, setView] = useState<PackagesView>(readViewFromLocation());
  const [scopeFilter, setScopeFilter] = useState<PackageScopeFilter>(readScopeFromLocation());
  const [detailTab, setDetailTab] = useState<PackageDetailTab>(readTabFromLocation());
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(readPackageIdFromLocation());
  const [selectedSourceRepo, setSelectedSourceRepo] = useState<string | null>(readSourceFromLocation());
  const [selectedCatalogName, setSelectedCatalogName] = useState<string>(readCatalogFromLocation());
  const [query, setQuery] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [importSource, setImportSource] = useState("");
  const [importRef, setImportRef] = useState("main");
  const [importSubdir, setImportSubdir] = useState(".");
  const [remoteName, setRemoteName] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [createForm, setCreateForm] = useState<CreatePackageForm>(DEFAULT_CREATE_FORM);

  const [checkoutRef, setCheckoutRef] = useState("");
  const [codeRoot, setCodeRoot] = useState<PackageRepoRoot>("package");
  const [codeRef, setCodeRef] = useState("");
  const [codePath, setCodePath] = useState("");
  const [codeRead, setCodeRead] = useState<PackageRepoReadResult | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeSearch, setCodeSearch] = useState("");
  const [codeSearchResult, setCodeSearchResult] = useState<PackageRepoSearchResult | null>(null);
  const [codeSearchBusy, setCodeSearchBusy] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<PackageRepoDiffResult | null>(null);
  const [diffBusy, setDiffBusy] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const updateRoute = useCallback((next: {
    view?: PackagesView;
    scope?: PackageScopeFilter;
    tab?: PackageDetailTab;
    packageId?: string | null;
    sourceRepo?: string | null;
    catalog?: string;
  }) => {
    const url = new URL(window.location.href);
    const nextView = next.view ?? view;
    const nextScope = next.scope ?? scopeFilter;
    const nextTab = next.tab ?? detailTab;
    const nextPackageId = next.packageId === undefined ? selectedPackageId : next.packageId;
    const nextSourceRepo = next.sourceRepo === undefined ? selectedSourceRepo : next.sourceRepo;
    const nextCatalog = next.catalog ?? selectedCatalogName;

    url.searchParams.set("view", nextView);
    url.searchParams.set("scope", nextScope);
    url.searchParams.set("tab", nextTab);

    if (nextPackageId) {
      url.searchParams.set("package", nextPackageId);
    } else {
      url.searchParams.delete("package");
    }
    if (nextSourceRepo) {
      url.searchParams.set("source", nextSourceRepo);
    } else {
      url.searchParams.delete("source");
    }
    if (nextCatalog) {
      url.searchParams.set("catalog", nextCatalog);
    } else {
      url.searchParams.delete("catalog");
    }

    window.history.pushState({}, "", url);
    setView(nextView);
    setScopeFilter(nextScope);
    setDetailTab(nextTab);
    setSelectedPackageId(nextPackageId ?? null);
    setSelectedSourceRepo(nextSourceRepo ?? null);
    setSelectedCatalogName(nextCatalog);
  }, [detailTab, scopeFilter, selectedCatalogName, selectedPackageId, selectedSourceRepo, view]);

  const refresh = useCallback(async (packageId: string | null) => {
    setPendingAction((current) => current ?? "load-state");
    try {
      const nextState = await backend.loadState(packageId ? { packageId } : {});
      setState(nextState);
      setError(null);
    } catch (cause) {
      setError(formatError(cause));
    } finally {
      setPendingAction((current) => current === "load-state" ? null : current);
    }
  }, [backend]);

  useEffect(() => {
    void refresh(selectedPackageId);
  }, [refresh, selectedPackageId]);

  useEffect(() => {
    const onPopState = () => {
      setView(readViewFromLocation());
      setScopeFilter(readScopeFromLocation());
      setDetailTab(readTabFromLocation());
      setSelectedPackageId(readPackageIdFromLocation());
      setSelectedSourceRepo(readSourceFromLocation());
      setSelectedCatalogName(readCatalogFromLocation());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const packages = state?.packages ?? [];
  const viewerUsername = state?.viewer.username ?? "";

  const visiblePackages = useMemo(() => {
    return packages
      .filter((pkg) => packageMatchesScope(pkg, scopeFilter))
      .filter((pkg) => packageMatchesView(pkg, view))
      .filter((pkg) => packageMatchesQuery(pkg, query))
      .sort(comparePackagesForView(view));
  }, [packages, query, scopeFilter, view]);

  const railPackages = useMemo(() => {
    return packages
      .filter((pkg) => packageMatchesScope(pkg, scopeFilter))
      .filter((pkg) => packageMatchesQuery(pkg, query))
      .sort(comparePackagesForView(view));
  }, [packages, query, scopeFilter, view]);

  const selectedPackage = useMemo(() => {
    if (!selectedPackageId || !state) {
      return null;
    }
    return state.packages.find((pkg) => pkg.packageId === selectedPackageId) ?? null;
  }, [selectedPackageId, state]);

  useEffect(() => {
    if (selectedPackageId && !selectedPackage && state) {
      updateRoute({ packageId: null });
    }
  }, [selectedPackage, selectedPackageId, state, updateRoute]);

  const selectedSource = useMemo<SourceRecord | null>(() => {
    const sources = state?.sources ?? [];
    if (sources.length === 0) return null;
    const filtered = sources.filter((source) => sourceMatchesQuery(source, query));
    if (filtered.length === 0) return null;
    return filtered.find((source) => source.repo === selectedSourceRepo) ?? filtered[0] ?? null;
  }, [query, selectedSourceRepo, state?.sources]);

  useEffect(() => {
    if (view !== "sources") {
      return;
    }
    if (!selectedSource && state?.sources?.length) {
      updateRoute({ sourceRepo: state.sources[0].repo });
    }
  }, [selectedSource, state?.sources, updateRoute, view]);

  const selectedCatalog = useMemo(() => {
    const catalogs = state?.catalogs ?? [];
    return catalogs.find((catalog) => catalog.name === selectedCatalogName) ?? catalogs[0] ?? null;
  }, [selectedCatalogName, state?.catalogs]);

  useEffect(() => {
    if (view === "discover" && selectedCatalog && selectedCatalog.name !== selectedCatalogName) {
      updateRoute({ catalog: selectedCatalog.name });
    }
  }, [selectedCatalog, selectedCatalogName, updateRoute, view]);

  useEffect(() => {
    if (!selectedPackage) {
      return;
    }
    setCheckoutRef(selectedPackage.source.ref);
    setCodeRoot("package");
    setCodeRef(selectedPackage.source.ref);
    setCodePath("");
    setCodeRead(null);
    setCodeError(null);
    setCodeSearch("");
    setCodeSearchResult(null);
    setSelectedCommit(null);
    setDiffResult(null);
    setDiffError(null);
  }, [selectedPackage?.packageId]);

  useEffect(() => {
    if (!selectedPackage || !state?.packageDetail) {
      return;
    }
    const commits = state.packageDetail.commits;
    if (commits.length === 0) {
      setSelectedCommit(null);
      return;
    }
    const next = selectedCommit && commits.some((commit) => commit.hash === selectedCommit)
      ? selectedCommit
      : commits[0].hash;
    if (next !== selectedCommit) {
      setSelectedCommit(next);
    }
  }, [selectedCommit, selectedPackage?.packageId, state?.packageDetail]);

  useEffect(() => {
    if (!selectedPackage || detailTab !== "source") {
      return;
    }
    let cancelled = false;
    setCodeBusy(true);
    setCodeError(null);
    void backend.readRepo({
      packageId: selectedPackage.packageId,
      ref: codeRef || undefined,
      path: codePath || undefined,
      root: codeRoot,
    }).then((result) => {
      if (cancelled) return;
      setCodeRead(result);
    }).catch((cause) => {
      if (cancelled) return;
      setCodeError(formatError(cause));
      setCodeRead(null);
    }).finally(() => {
      if (!cancelled) {
        setCodeBusy(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [backend, codePath, codeRef, codeRoot, detailTab, selectedPackage?.packageId]);

  useEffect(() => {
    if (!selectedPackage || detailTab !== "source" || !selectedCommit) {
      return;
    }
    let cancelled = false;
    setDiffBusy(true);
    setDiffError(null);
    void backend.diffRepo({ packageId: selectedPackage.packageId, commit: selectedCommit, context: 3 }).then((result) => {
      if (cancelled) return;
      setDiffResult(result);
    }).catch((cause) => {
      if (cancelled) return;
      setDiffError(formatError(cause));
      setDiffResult(null);
    }).finally(() => {
      if (!cancelled) {
        setDiffBusy(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [backend, detailTab, selectedCommit, selectedPackage?.packageId]);

  const browseRefs = useMemo(() => buildRefOptions(state?.packageDetail, selectedPackage?.source.ref), [selectedPackage?.source.ref, state?.packageDetail]);
  const selectedCommitRecord = useMemo(() => {
    return state?.packageDetail?.commits.find((commit) => commit.hash === selectedCommit) ?? null;
  }, [selectedCommit, state?.packageDetail]);

  const packageMutationBlockedReason = selectedPackage && !selectedPackage.canMutate
    ? "This package is outside your mutable package scope."
    : "";
  const packageVisibilityBlockedReason = selectedPackage && !selectedPackage.canChangeVisibility
    ? "Only root or the repo owner can change visibility for this source."
    : "";
  const packagePullBlockedReason = selectedPackage && !selectedPackage.canPullSource
    ? "Only packages imported from an upstream source can be pulled."
    : "";
  const sourceRefreshBlockedReason = selectedSource && !selectedSource.refreshable
    ? "You can only sync sources installed in your mutable package scope."
    : "";
  const sourcePullBlockedReason = selectedSource && !selectedSource.pullable
    ? "Only sources imported from an upstream can be pulled."
    : "";
  const sourceVisibilityBlockedReason = selectedSource && !selectedSource.canChangeVisibility
    ? "Only root or the repo owner can change visibility for this source."
    : "";

  async function runAction(name: string, work: () => Promise<void>) {
    setPendingAction(name);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (cause) {
      setError(formatError(cause));
    } finally {
      setPendingAction(null);
    }
  }

  const handleSyncSources = useCallback(() => {
    void runAction("sync-sources", async () => {
      await backend.syncSources();
      await refresh(selectedPackage?.packageId ?? selectedPackageId);
      setNotice("Synced packages from source.");
    });
  }, [backend, refresh, selectedPackage?.packageId, selectedPackageId]);

  const handleImportPackage = useCallback(() => {
    void runAction("import-package", async () => {
      const result = await backend.importPackage({
        source: importSource,
        ref: importRef,
        subdir: importSubdir,
      });
      updateRoute({ view: "inventory", packageId: result.package.packageId, sourceRepo: result.package.source.repo, tab: "summary" });
      await refresh(result.package.packageId);
      setNotice(`Imported ${result.package.name}.`);
    });
  }, [backend, importRef, importSource, importSubdir, refresh, updateRoute]);

  const handleCreatePackage = useCallback(() => {
    void runAction("create-package", async () => {
      const result = await backend.createPackage({
        repo: createRepoName(createForm.repo),
        ref: createForm.ref,
        subdir: createForm.subdir,
        name: createForm.packageName,
        displayName: createForm.displayName,
        description: createForm.description,
        template: createForm.template,
        command: createForm.command,
        enable: createForm.enable,
        overwrite: createForm.overwrite,
      });
      updateRoute({ view: "inventory", packageId: result.package.packageId, sourceRepo: result.package.source.repo, tab: "source" });
      await refresh(result.package.packageId);
      setNotice(`${result.created ? "Created" : "Updated"} ${result.package.name} with ${result.files.length} scaffold file${result.files.length === 1 ? "" : "s"}.`);
    });
  }, [backend, createForm, refresh, updateRoute]);

  const handleAddRemote = useCallback(() => {
    void runAction("add-remote", async () => {
      await backend.addRemote({ name: remoteName, baseUrl: remoteUrl });
      await refresh(selectedPackage?.packageId ?? selectedPackageId);
      setRemoteName("");
      setRemoteUrl("");
      setNotice(`Added remote ${remoteName}.`);
    });
  }, [backend, refresh, remoteName, remoteUrl, selectedPackage?.packageId, selectedPackageId]);

  const handleRemoveRemote = useCallback((name: string) => {
    void runAction(`remove-remote:${name}`, async () => {
      await backend.removeRemote({ name });
      await refresh(selectedPackage?.packageId ?? selectedPackageId);
      setNotice(`Removed remote ${name}.`);
    });
  }, [backend, refresh, selectedPackage?.packageId, selectedPackageId]);

  const handleEnablePackage = useCallback((packageId: string) => {
    void runAction(`enable:${packageId}`, async () => {
      await backend.enablePackage({ packageId });
      await refresh(packageId);
      setNotice("Package enabled.");
    });
  }, [backend, refresh]);

  const handleDisablePackage = useCallback((packageId: string) => {
    void runAction(`disable:${packageId}`, async () => {
      await backend.disablePackage({ packageId });
      await refresh(packageId);
      setNotice("Package disabled.");
    });
  }, [backend, refresh]);

  const handleApproveReview = useCallback((packageId: string) => {
    void runAction(`approve:${packageId}`, async () => {
      await backend.approveReview({ packageId });
      await refresh(packageId);
      setNotice("Package review approved.");
    });
  }, [backend, refresh]);

  const handleRefreshPackage = useCallback((packageId: string) => {
    void runAction(`refresh:${packageId}`, async () => {
      await backend.refreshPackage({ packageId });
      await refresh(packageId);
      setNotice("Synced the package from source.");
    });
  }, [backend, refresh]);

  const handleRefreshSource = useCallback((repo: string) => {
    void runAction(`refresh-source:${repo}`, async () => {
      await backend.refreshSource({ repo });
      await refresh(selectedPackage?.packageId ?? selectedPackageId);
      setNotice(`Synced packages from ${repo}.`);
    });
  }, [backend, refresh, selectedPackage?.packageId, selectedPackageId]);

  const handlePullPackage = useCallback((packageId: string) => {
    void runAction(`pull:${packageId}`, async () => {
      await backend.pullPackage({ packageId });
      await refresh(packageId);
      setNotice("Pulled upstream changes. Sync the package to install them.");
    });
  }, [backend, refresh]);

  const handlePullSource = useCallback((repo: string) => {
    void runAction(`pull-source:${repo}`, async () => {
      await backend.pullSource({ repo });
      await refresh(selectedPackage?.packageId ?? selectedPackageId);
      setNotice(`Pulled upstream changes for ${repo}. Sync packages to install them.`);
    });
  }, [backend, refresh, selectedPackage?.packageId, selectedPackageId]);

  const handleCheckout = useCallback((packageId: string) => {
    void runAction(`checkout:${packageId}`, async () => {
      await backend.checkoutPackage({ packageId, ref: checkoutRef });
      await refresh(packageId);
      setCodeRef(checkoutRef);
      setNotice(`Checked out ${checkoutRef}.`);
    });
  }, [backend, checkoutRef, refresh]);

  const handleSetPublic = useCallback((payload: { packageId?: string; repo?: string; public: boolean }) => {
    void runAction(`public:${payload.repo ?? payload.packageId ?? "unknown"}`, async () => {
      await backend.setPublic(payload);
      await refresh(selectedPackage?.packageId ?? selectedPackageId);
      setNotice(payload.public ? "Source is now public." : "Source is now private.");
    });
  }, [backend, refresh, selectedPackage?.packageId, selectedPackageId]);

  const handleStartReview = useCallback((packageId: string) => {
    void runAction(`review:${packageId}`, async () => {
      const spawned = await backend.startReview({ packageId });
      openChatProcess(spawned);
      setNotice("Opened package review in Chat.");
    });
  }, [backend]);

  const handleSearchRepo = useCallback(() => {
    if (!selectedPackage || !codeSearch.trim()) {
      setCodeSearchResult(null);
      return;
    }
    setCodeSearchBusy(true);
    setCodeError(null);
    void backend.searchRepo({
      packageId: selectedPackage.packageId,
      ref: codeRef || undefined,
      query: codeSearch,
      root: codeRoot,
      prefix: codeRead?.kind === "tree" ? codeRead.path || undefined : undefined,
    }).then((result) => {
      setCodeSearchResult(result);
    }).catch((cause) => {
      setCodeError(formatError(cause));
      setCodeSearchResult(null);
    }).finally(() => {
      setCodeSearchBusy(false);
    });
  }, [backend, codeRead?.kind, codeRead?.path, codeRef, codeRoot, codeSearch, selectedPackage]);

  const content = selectedPackage && view !== "create" && view !== "discover" && view !== "remotes" && view !== "sources" ? (
    <PackageDetailView
      pkg={selectedPackage}
      state={state}
      viewerUsername={viewerUsername}
      activeTab={detailTab}
      pendingAction={pendingAction}
      packageMutationBlockedReason={packageMutationBlockedReason}
      packageVisibilityBlockedReason={packageVisibilityBlockedReason}
      packagePullBlockedReason={packagePullBlockedReason}
      browseRefs={browseRefs}
      checkoutRef={checkoutRef}
      setCheckoutRef={setCheckoutRef}
      selectedCommit={selectedCommit}
      selectedCommitRecord={selectedCommitRecord}
      diffBusy={diffBusy}
      diffError={diffError}
      diffResult={diffResult}
      codeRoot={codeRoot}
      codeRef={codeRef}
      codePath={codePath}
      codeRead={codeRead}
      codeBusy={codeBusy}
      codeError={codeError}
      codeSearch={codeSearch}
      codeSearchBusy={codeSearchBusy}
      codeSearchResult={codeSearchResult}
      onBack={() => updateRoute({ packageId: null })}
      onTab={(tab) => updateRoute({ tab })}
      onEnable={handleEnablePackage}
      onDisable={handleDisablePackage}
      onApprove={handleApproveReview}
      onRefresh={handleRefreshPackage}
      onPull={handlePullPackage}
      onSetPublic={handleSetPublic}
      onStartReview={handleStartReview}
      onCheckout={handleCheckout}
      onSelectCommit={setSelectedCommit}
      setCodeRoot={setCodeRoot}
      setCodeRef={setCodeRef}
      setCodePath={setCodePath}
      setCodeSearch={setCodeSearch}
      setCodeSearchResult={setCodeSearchResult}
      handleSearchRepo={handleSearchRepo}
    />
  ) : view === "create" ? (
    <CreatePackagePanel
      form={createForm}
      viewerUsername={viewerUsername}
      pendingAction={pendingAction}
      onChange={(patch) => setCreateForm((current) => ({ ...current, ...patch }))}
      onSubmit={handleCreatePackage}
    />
  ) : view === "discover" ? (
    <DiscoverPanel
      state={state}
      selectedCatalog={selectedCatalog}
      importSource={importSource}
      importRef={importRef}
      importSubdir={importSubdir}
      pendingAction={pendingAction}
      setImportSource={setImportSource}
      setImportRef={setImportRef}
      setImportSubdir={setImportSubdir}
      updateRoute={updateRoute}
      handleImportPackage={handleImportPackage}
      importCatalogEntry={(catalog, entry) => {
        setImportSource(catalogImportSource(catalog, entry));
        setImportRef(entry.source.ref || "main");
        setImportSubdir(entry.source.subdir || ".");
        void runAction(`catalog-import:${entry.source.repo}:${entry.source.subdir}`, async () => {
          const result = await backend.importPackage({
            source: catalogImportSource(catalog, entry),
            ref: entry.source.ref || "main",
            subdir: entry.source.subdir || ".",
          });
          updateRoute({ view: "inventory", packageId: result.package.packageId, sourceRepo: result.package.source.repo, tab: "summary" });
          await refresh(result.package.packageId);
          setNotice(`Imported ${result.package.name}.`);
        });
      }}
    />
  ) : view === "sources" ? (
    <SourcesPanel
      state={state}
      query={query}
      viewerUsername={viewerUsername}
      selectedSource={selectedSource}
      pendingAction={pendingAction}
      sourceRefreshBlockedReason={sourceRefreshBlockedReason}
      sourcePullBlockedReason={sourcePullBlockedReason}
      sourceVisibilityBlockedReason={sourceVisibilityBlockedReason}
      updateRoute={updateRoute}
      handleRefreshSource={handleRefreshSource}
      handlePullSource={handlePullSource}
      handleSetPublic={handleSetPublic}
    />
  ) : view === "remotes" ? (
    <RemotesPanel
      state={state}
      remoteName={remoteName}
      remoteUrl={remoteUrl}
      pendingAction={pendingAction}
      setRemoteName={setRemoteName}
      setRemoteUrl={setRemoteUrl}
      updateRoute={updateRoute}
      handleAddRemote={handleAddRemote}
      handleRemoveRemote={handleRemoveRemote}
    />
  ) : (
    <InventoryPanel
      packages={visiblePackages}
      view={view}
      query={query}
      viewerUsername={viewerUsername}
      onOpenPackage={(pkg) => updateRoute({ view: view === "review" || view === "updates" ? view : "inventory", packageId: pkg.packageId, sourceRepo: pkg.source.repo, tab: "summary" })}
    />
  );

  return (
    <div class="packages-app-shell">
      <header class="packages-topbar">
        <div>
          <p class="packages-eyebrow">Software trust</p>
          <h1>Packages</h1>
          <p>Installed apps, source, review state, updates, and package creation.</p>
        </div>
        <div class="packages-topbar-actions">
          <label class="packages-search-field">
            <span>Search</span>
            <input value={query} onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)} placeholder="Package, source, or capability" />
          </label>
          <button class="packages-button packages-button--primary" type="button" onClick={() => updateRoute({ view: "create", packageId: null })}>New package</button>
          <button class="packages-button" type="button" disabled={pendingAction === "sync-sources"} onClick={handleSyncSources}>
            {pendingAction === "sync-sources" ? "Syncing" : "Sync all"}
          </button>
        </div>
      </header>

      {error ? <div class="packages-banner packages-banner--error">{error}</div> : null}
      {notice ? <div class="packages-banner">{notice}</div> : null}

      <main class={`packages-workbench${selectedPackage ? " has-selected-package" : ""}`}>
        <aside class="packages-rail">
          <nav class="packages-nav" aria-label="Package work queues">
            <QueueButton label="Inventory" count={state?.counts.installed ?? 0} active={view === "inventory"} onClick={() => updateRoute({ view: "inventory", packageId: null })} />
            <QueueButton label="Needs review" count={state?.counts.review ?? 0} active={view === "review"} tone="warning" onClick={() => updateRoute({ view: "review", packageId: null })} />
            <QueueButton label="Updates" count={state?.counts.updates ?? 0} active={view === "updates"} tone="accent" onClick={() => updateRoute({ view: "updates", packageId: null })} />
            <QueueButton label="Sources" count={state?.sources.length ?? 0} active={view === "sources"} onClick={() => updateRoute({ view: "sources", packageId: null })} />
            <QueueButton label="Discover" count={catalogPackageCount(state)} active={view === "discover"} onClick={() => updateRoute({ view: "discover", packageId: null })} />
            <QueueButton label="Remotes" count={(state?.catalogs ?? []).filter((catalog) => catalog.kind === "remote").length} active={view === "remotes"} onClick={() => updateRoute({ view: "remotes", packageId: null })} />
          </nav>

          <div class="packages-scope-filter" role="group" aria-label="Package scope">
            {(["all", "mine", "system"] as PackageScopeFilter[]).map((filter) => (
              <button
                key={filter}
                class={`packages-segment${scopeFilter === filter ? " is-active" : ""}`}
                type="button"
                onClick={() => updateRoute({ scope: filter, packageId: null })}
              >
                {filter === "all" ? "All" : filter === "mine" ? "Mine" : "System"}
              </button>
            ))}
          </div>

          <section class="packages-rail-list" aria-label="Packages">
            <header>
              <strong>Packages</strong>
              <span>{railPackages.length}</span>
            </header>
            <div>
              {state === null ? (
                <p class="packages-empty">Loading packages...</p>
              ) : railPackages.length === 0 ? (
                <p class="packages-empty">No packages match this filter.</p>
              ) : railPackages.map((pkg) => (
                <button
                  key={pkg.packageId}
                  class={`packages-package-row${selectedPackage?.packageId === pkg.packageId ? " is-active" : ""}`}
                  type="button"
                  onClick={() => updateRoute({ view: pkg.reviewPending ? "review" : pkg.updateAvailable ? "updates" : "inventory", packageId: pkg.packageId, sourceRepo: pkg.source.repo, tab: "summary" })}
                >
                  <span class={`packages-status-dot ${statusClass(pkg)}`} aria-hidden="true"></span>
                  <span>
                    <strong>{pkg.name}</strong>
                    <small><RepoSlug repo={pkg.source.repo} viewerUsername={viewerUsername} /></small>
                  </span>
                  <PackageBadges pkg={pkg} compact />
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section class="packages-main-pane">
          {content}
        </section>
      </main>
    </div>
  );
}

function QueueButton(props: { label: string; count: number; active: boolean; tone?: "accent" | "warning"; onClick: () => void }) {
  return (
    <button class={`packages-nav-row${props.active ? " is-active" : ""}${props.tone ? ` is-${props.tone}` : ""}`} type="button" onClick={props.onClick}>
      <span>{props.label}</span>
      <strong>{props.count}</strong>
    </button>
  );
}

function SourcesPanel(props: {
  state: PackagesState | null;
  query: string;
  viewerUsername: string;
  selectedSource: SourceRecord | null;
  pendingAction: string | null;
  sourceRefreshBlockedReason: string;
  sourcePullBlockedReason: string;
  sourceVisibilityBlockedReason: string;
  updateRoute: (next: { view?: PackagesView; scope?: PackageScopeFilter; tab?: PackageDetailTab; packageId?: string | null; sourceRepo?: string | null; catalog?: string }) => void;
  handleRefreshSource: (repo: string) => void;
  handlePullSource: (repo: string) => void;
  handleSetPublic: (payload: { packageId?: string; repo?: string; public: boolean }) => void;
}) {
  const sources = (props.state?.sources ?? []).filter((source) => sourceMatchesQuery(source, props.query));
  const sourcePackages = props.state?.packages.filter((pkg) => pkg.source.repo === props.selectedSource?.repo) ?? [];
  const sourceListEmpty = props.state === null ? "Loading sources..." : "No source repositories match this filter.";
  return (
    <section class="packages-panel">
      <header class="packages-panel-head">
        <div>
          <p class="packages-eyebrow">Source repositories</p>
          <h2>Sources</h2>
          <p>Installed package source grouped by ripgit repository.</p>
        </div>
      </header>
      <section class="packages-sources-layout">
        <div class="packages-source-list">
          {sources.length === 0 ? <div class="packages-empty-state">{sourceListEmpty}</div> : sources.map((source) => (
            <button key={source.repo} class={`packages-source-row${props.selectedSource?.repo === source.repo ? " is-active" : ""}`} type="button" onClick={() => props.updateRoute({ sourceRepo: source.repo })}>
              <strong><RepoSlug repo={source.repo} viewerUsername={props.viewerUsername} /></strong>
              <span>{source.packageCount} package{source.packageCount === 1 ? "" : "s"}</span>
              <span class="packages-badge-row">
                {source.updateCount > 0 ? <span class="packages-badge is-update">{source.updateCount} updates</span> : null}
                {source.reviewPendingCount > 0 ? <span class="packages-badge is-review">{source.reviewPendingCount} reviews</span> : null}
              </span>
            </button>
          ))}
        </div>
        <div class="packages-source-detail">
          {props.selectedSource ? (
            <>
              <header>
                <div>
                  <h3><RepoSlug repo={props.selectedSource.repo} viewerUsername={props.viewerUsername} /></h3>
                  <p>{props.selectedSource.isBuiltin ? "Builtin source" : props.selectedSource.pullable ? "Imported source" : "Local source"} - {props.selectedSource.public ? "public" : "private"}</p>
                </div>
                <div class="packages-inline-actions">
                  <button
                    class="packages-button"
                    type="button"
                    title={props.sourceRefreshBlockedReason || undefined}
                    disabled={!props.selectedSource.refreshable || props.pendingAction === `refresh-source:${props.selectedSource.repo}`}
                    onClick={() => props.handleRefreshSource(props.selectedSource?.repo ?? "")}
                  >
                    Sync packages
                  </button>
                  <button
                    class="packages-button"
                    type="button"
                    title={props.sourcePullBlockedReason || undefined}
                    disabled={!props.selectedSource.pullable || props.pendingAction === `pull-source:${props.selectedSource.repo}`}
                    onClick={() => props.handlePullSource(props.selectedSource?.repo ?? "")}
                  >
                    Pull upstream
                  </button>
                  {!props.selectedSource.isBuiltin ? (
                    <button
                      class="packages-button"
                      type="button"
                      title={props.sourceVisibilityBlockedReason || undefined}
                      disabled={!props.selectedSource.canChangeVisibility || props.pendingAction === `public:${props.selectedSource.repo}`}
                      onClick={() => props.handleSetPublic({ repo: props.selectedSource?.repo, public: !(props.selectedSource?.public ?? false) })}
                    >
                      {props.selectedSource.public ? "Hide source" : "Publish source"}
                    </button>
                  ) : null}
                </div>
              </header>
              <div class="packages-info-grid">
                <InfoItem label="Packages" value={String(props.selectedSource.packageCount)} />
                <InfoItem label="Pending review" value={String(props.selectedSource.reviewPendingCount)} />
                <InfoItem label="Updates" value={String(props.selectedSource.updateCount)} />
                <article>
                  <span>Latest update</span>
                  <strong><TimeAgo timestamp={props.selectedSource.latestUpdatedAt} /></strong>
                </article>
              </div>
              <PackageInventoryTable packages={sourcePackages} query="" viewerUsername={props.viewerUsername} onOpenPackage={(pkg) => props.updateRoute({ view: "inventory", packageId: pkg.packageId, sourceRepo: pkg.source.repo, tab: "summary" })} />
            </>
          ) : <div class="packages-empty-state">Select a source repository.</div>}
        </div>
      </section>
    </section>
  );
}

function DiscoverPanel(props: {
  state: PackagesState | null;
  selectedCatalog: CatalogRecord | null;
  importSource: string;
  importRef: string;
  importSubdir: string;
  pendingAction: string | null;
  setImportSource: (value: string) => void;
  setImportRef: (value: string) => void;
  setImportSubdir: (value: string) => void;
  updateRoute: (next: { view?: PackagesView; scope?: PackageScopeFilter; tab?: PackageDetailTab; packageId?: string | null; sourceRepo?: string | null; catalog?: string }) => void;
  handleImportPackage: () => void;
  importCatalogEntry: (catalog: CatalogRecord, entry: CatalogEntry) => void;
}) {
  return (
    <section class="packages-panel">
      <header class="packages-panel-head">
        <div>
          <p class="packages-eyebrow">Discover</p>
          <h2>Import packages</h2>
          <p>Install from GitHub shorthand, a remote URL, local catalog, or trusted remote catalog.</p>
        </div>
      </header>
      <section class="packages-import-panel">
        <header>
          <h3>Import by source</h3>
          <p>Third-party imports stay disabled until reviewed.</p>
        </header>
        <div class="packages-form-grid">
          <label>
            <span>Source</span>
            <input value={props.importSource} onInput={(event) => props.setImportSource((event.currentTarget as HTMLInputElement).value)} placeholder="github-owner/repo or https://..." />
          </label>
          <label>
            <span>Ref</span>
            <input value={props.importRef} onInput={(event) => props.setImportRef((event.currentTarget as HTMLInputElement).value)} placeholder="main" />
          </label>
          <label>
            <span>Subdir</span>
            <input value={props.importSubdir} onInput={(event) => props.setImportSubdir((event.currentTarget as HTMLInputElement).value)} placeholder="." />
          </label>
          <button class="packages-button packages-button--primary" type="button" disabled={props.pendingAction === "import-package"} onClick={props.handleImportPackage}>Import</button>
        </div>
      </section>

      <section class="packages-subsection">
        <header class="packages-section-head">
          <div>
            <h3>Catalogs</h3>
            <p>Public packages advertised by this system and configured remotes.</p>
          </div>
          <div class="packages-inline-actions">
            {(props.state?.catalogs ?? []).map((catalog) => (
              <button key={catalog.name} class={`packages-segment${props.selectedCatalog?.name === catalog.name ? " is-active" : ""}`} type="button" onClick={() => props.updateRoute({ catalog: catalog.name })}>
                {catalog.kind === "local" ? "Local" : catalog.name}
              </button>
            ))}
          </div>
        </header>
        {props.selectedCatalog ? (
          <>
            <div class="packages-catalog-meta">
              <span>{props.selectedCatalog.kind === "local" ? "Local catalog" : props.selectedCatalog.baseUrl}</span>
              {props.selectedCatalog.error ? <span class="packages-badge is-disabled">Unavailable</span> : <span class="packages-badge">{props.selectedCatalog.packages.length} packages</span>}
            </div>
            {props.selectedCatalog.error ? <div class="packages-empty-state">{props.selectedCatalog.error}</div> : (
              <div class="packages-table packages-catalog-table">
                <div class="packages-table-head">
                  <span>Package</span>
                  <span>Source</span>
                  <span>Action</span>
                </div>
                {props.selectedCatalog.packages.map((entry) => {
                  const installed = matchInstalledPackage(entry, props.state?.packages ?? []);
                  return (
                    <div key={`${entry.source.repo}:${entry.source.subdir}:${entry.name}`} class="packages-table-row">
                      <span class="packages-table-primary" data-label="Package">
                        <strong>{entry.name}</strong>
                        <small>{entry.description || formatRepoDisplay(entry.source.repo, props.state?.viewer.username ?? "")}</small>
                      </span>
                      <span data-label="Source"><RepoSlug repo={entry.source.repo} viewerUsername={props.state?.viewer.username ?? ""} /></span>
                      <span class="packages-inline-actions" data-label="Action">
                        {installed ? (
                          <button class="packages-button" type="button" onClick={() => props.updateRoute({ view: installed.reviewPending ? "review" : installed.updateAvailable ? "updates" : "inventory", packageId: installed.packageId, sourceRepo: installed.source.repo, tab: "summary" })}>
                            Inspect
                          </button>
                        ) : null}
                        <button class="packages-button packages-button--primary" type="button" disabled={props.pendingAction === `catalog-import:${entry.source.repo}:${entry.source.subdir}`} onClick={() => props.selectedCatalog ? props.importCatalogEntry(props.selectedCatalog, entry) : undefined}>
                          {installed ? "Re-import" : "Import"}
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : <div class="packages-empty-state">No catalogs configured.</div>}
      </section>
    </section>
  );
}

function RemotesPanel(props: {
  state: PackagesState | null;
  remoteName: string;
  remoteUrl: string;
  pendingAction: string | null;
  setRemoteName: (value: string) => void;
  setRemoteUrl: (value: string) => void;
  updateRoute: (next: { view?: PackagesView; scope?: PackageScopeFilter; tab?: PackageDetailTab; packageId?: string | null; sourceRepo?: string | null; catalog?: string }) => void;
  handleAddRemote: () => void;
  handleRemoveRemote: (name: string) => void;
}) {
  const remotes = (props.state?.catalogs ?? []).filter((catalog) => catalog.kind === "remote");
  return (
    <section class="packages-panel">
      <header class="packages-panel-head">
        <div>
          <p class="packages-eyebrow">Catalog remotes</p>
          <h2>Remotes</h2>
          <p>Catalogs from other GSV instances. Keep this separate from installed source repositories.</p>
        </div>
      </header>
      <section class="packages-import-panel">
        <header>
          <h3>Add remote catalog</h3>
          <p>Remote catalogs only expose public package metadata.</p>
        </header>
        <div class="packages-form-grid packages-form-grid--remote">
          <label>
            <span>Name</span>
            <input value={props.remoteName} onInput={(event) => props.setRemoteName((event.currentTarget as HTMLInputElement).value)} placeholder="team" />
          </label>
          <label>
            <span>Base URL</span>
            <input value={props.remoteUrl} onInput={(event) => props.setRemoteUrl((event.currentTarget as HTMLInputElement).value)} placeholder="https://gsv.example.com" />
          </label>
          <button class="packages-button packages-button--primary" type="button" disabled={props.pendingAction === "add-remote"} onClick={props.handleAddRemote}>Add remote</button>
        </div>
      </section>
      <div class="packages-table packages-remotes-table">
        <div class="packages-table-head">
          <span>Remote</span>
          <span>Base URL</span>
          <span>Action</span>
        </div>
        {remotes.length === 0 ? <div class="packages-empty-state">No remote catalogs configured.</div> : remotes.map((catalog) => (
          <div key={catalog.name} class="packages-table-row">
            <span class="packages-table-primary" data-label="Remote">
              <strong>{catalog.name}</strong>
              <small>{catalog.packages.length} package{catalog.packages.length === 1 ? "" : "s"}</small>
            </span>
            <span class="packages-mono" data-label="Base URL">{catalog.baseUrl}</span>
            <span class="packages-inline-actions" data-label="Action">
              <button class="packages-button" type="button" onClick={() => props.updateRoute({ view: "discover", catalog: catalog.name })}>Open catalog</button>
              <button class="packages-button packages-button--danger" type="button" disabled={props.pendingAction === `remove-remote:${catalog.name}`} onClick={() => props.handleRemoveRemote(catalog.name)}>Remove</button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CreatePackagePanel(props: {
  form: CreatePackageForm;
  viewerUsername: string;
  pendingAction: string | null;
  onChange: (patch: Partial<CreatePackageForm>) => void;
  onSubmit: () => void;
}) {
  const { form } = props;
  const owner = props.viewerUsername || "you";
  return (
    <section class="packages-panel packages-create-panel">
      <header class="packages-panel-head">
        <div>
          <p class="packages-eyebrow">New package</p>
          <h2>Create package source</h2>
          <p>Scaffold a user-owned package in ripgit, install it, and mount it under /src/packages.</p>
        </div>
      </header>

      <section class="packages-create-grid">
        <div class="packages-create-main">
          <label>
            <span>Repository name</span>
            <div class="packages-owned-repo-field">
              <span>{owner}/</span>
              <input value={form.repo} onInput={(event) => props.onChange({ repo: createRepoName((event.currentTarget as HTMLInputElement).value) })} placeholder="my-package" />
            </div>
          </label>
          <div class="packages-form-pair">
            <label>
              <span>Package name</span>
              <input value={form.packageName} onInput={(event) => props.onChange({ packageName: (event.currentTarget as HTMLInputElement).value })} placeholder={`@${owner}/package`} />
            </label>
            <label>
              <span>Display name</span>
              <input value={form.displayName} onInput={(event) => props.onChange({ displayName: (event.currentTarget as HTMLInputElement).value })} placeholder="Package name in the desktop" />
            </label>
          </div>
          <label>
            <span>Description</span>
            <textarea value={form.description} onInput={(event) => props.onChange({ description: (event.currentTarget as HTMLTextAreaElement).value })} placeholder="What this package does" />
          </label>
          <div class="packages-form-pair">
            <label>
              <span>Branch</span>
              <input value={form.ref} onInput={(event) => props.onChange({ ref: (event.currentTarget as HTMLInputElement).value })} placeholder="main" />
            </label>
            <label>
              <span>Subdir</span>
              <input value={form.subdir} onInput={(event) => props.onChange({ subdir: (event.currentTarget as HTMLInputElement).value })} placeholder="." />
            </label>
          </div>
          <div class="packages-template-options">
            <button class={`packages-template-option${form.template === "web-ui" ? " is-active" : ""}`} type="button" onClick={() => props.onChange({ template: "web-ui" })}>
              <strong>App UI</strong>
              <span>Browser package with a desktop window.</span>
            </button>
            <button class={`packages-template-option${form.template === "command" ? " is-active" : ""}`} type="button" onClick={() => props.onChange({ template: "command" })}>
              <strong>CLI command</strong>
              <span>Command package for process and shell workflows.</span>
            </button>
          </div>
          {form.template === "command" ? (
            <label>
              <span>Command name</span>
              <input value={form.command} onInput={(event) => props.onChange({ command: (event.currentTarget as HTMLInputElement).value })} placeholder="my-command" />
            </label>
          ) : null}
        </div>
        <aside class="packages-create-aside">
          <section>
            <h3>Create behavior</h3>
            <label class="packages-check-row">
              <input type="checkbox" checked={form.enable} onChange={(event) => props.onChange({ enable: (event.currentTarget as HTMLInputElement).checked })} />
              <span>Enable immediately after creation</span>
            </label>
            <label class="packages-check-row">
              <input type="checkbox" checked={form.overwrite} onChange={(event) => props.onChange({ overwrite: (event.currentTarget as HTMLInputElement).checked })} />
              <span>Overwrite scaffold files if package source already exists</span>
            </label>
          </section>
          <section>
            <h3>What happens</h3>
            <ul class="packages-bullet-list">
              <li>Creates source files in {owner}'s ripgit repo and branch.</li>
              <li>Installs the package into your mutable package scope.</li>
              <li>Makes source available under /src/packages after install.</li>
              <li>Leaves future source edits explicit through package source commit flows.</li>
            </ul>
          </section>
          <button class="packages-button packages-button--primary packages-button--full" type="button" disabled={props.pendingAction === "create-package"} onClick={props.onSubmit}>
            {props.pendingAction === "create-package" ? "Creating" : "Create package"}
          </button>
        </aside>
      </section>
    </section>
  );
}

function openChatProcess(detail: { pid: string; workspaceId: string | null; cwd: string | null }) {
  const pid = String(detail.pid ?? "").trim();
  const cwd = String(detail.cwd ?? "").trim();
  if (!pid || !cwd) {
    return;
  }
  const workspaceId = detail.workspaceId == null ? null : String(detail.workspaceId);
  openApp({
    target: "chat",
    payload: { pid, workspaceId, cwd },
  });
}
