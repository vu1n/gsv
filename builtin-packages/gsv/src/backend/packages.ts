import type {
  CatalogEntry,
  CatalogRecord,
  LoadPackagesStateArgs,
  PackageCommit,
  PackageDetail,
  PackageEntrypoint,
  PackageProfile,
  PackageRecord,
  PackagesState,
  SourceRecord,
} from "../app/features/packages/types";

type KernelClientLike = {
  request(method: string, payload?: unknown): Promise<unknown>;
};

type ViewerRuntime = {
  viewer?: {
    uid?: number;
    username?: string;
  };
};

type NormalizedViewer = PackagesState["viewer"];

type PackageLike = {
  packageId: string;
  scope: PackageRecord["scope"];
  name: string;
  description: string;
  version: string;
  runtime: string;
  enabled: boolean;
  source: PackageRecord["source"];
  entrypoints: PackageEntrypoint[];
  profiles?: PackageProfile[];
  bindingNames: string[];
  review: PackageRecord["review"];
  installedAt: number;
  updatedAt: number;
};

type RemoteRecord = {
  name?: unknown;
  baseUrl?: unknown;
};

type DerivedPackageRecord = PackageRecord;

export async function loadPackagesState(
  args: LoadPackagesStateArgs | undefined,
  kernel: KernelClientLike,
  ctx: ViewerRuntime,
): Promise<PackagesState> {
  const viewer = normalizeViewer({
    uid: ctx.viewer?.uid ?? 0,
    username: ctx.viewer?.username ?? "",
  });
  const packagesRaw = await listPackages(kernel);
  const refsByRepo = await loadRefsForPackages(kernel, packagesRaw);
  const packages = packagesRaw.map((pkg) => derivePackageView(pkg, refsByRepo, viewer));
  const sources = aggregateSources(packages);
  const catalogs = await loadCatalogs(kernel);

  let packageDetail: PackageDetail | null = null;
  const packageId = typeof args?.packageId === "string" ? args.packageId.trim() : "";
  if (packageId) {
    const target = packages.find((pkg) => pkg.packageId === packageId);
    if (target) {
      try {
        packageDetail = await loadPackageDetail(kernel, target);
      } catch {
        packageDetail = null;
      }
    }
  }

  return {
    viewer,
    packages,
    sources,
    catalogs,
    counts: {
      installed: packages.length,
      review: packages.filter((pkg) => pkg.reviewPending).length,
      updates: packages.filter((pkg) => pkg.updateAvailable).length,
    },
    packageDetail,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value) ?? {};
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === "string") {
      result[key] = item;
    }
  }
  return result;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function isBuiltinRepo(repo: string): boolean {
  return repo === "root/gsv";
}

function repoOwner(repo: string): string {
  return repo.split("/")[0] ?? "";
}

function normalizeViewer(viewer: { uid: number; username: string }): NormalizedViewer {
  return {
    uid: viewer.uid,
    username: viewer.username || (viewer.uid === 0 ? "root" : "user"),
    isRoot: viewer.uid === 0,
  };
}

function canMutatePackage(pkg: PackageLike, viewer: NormalizedViewer): boolean {
  return viewer.isRoot || (pkg.scope.kind === "user" && pkg.scope.uid === viewer.uid);
}

async function listPackages(kernel: KernelClientLike): Promise<PackageLike[]> {
  const result = asRecord(await kernel.request("pkg.list", {}));
  return asArray<PackageLike>(result?.packages);
}

async function loadRefsForPackages(
  kernel: KernelClientLike,
  packages: PackageLike[],
): Promise<Map<string, Record<string, string>>> {
  const byRepo = new Map<string, PackageLike>();
  for (const pkg of packages) {
    if (!byRepo.has(pkg.source.repo)) {
      byRepo.set(pkg.source.repo, pkg);
    }
  }

  const entries = await Promise.all([...byRepo.keys()].map(async (repo) => {
    try {
      const refs = asRecord(await kernel.request("repo.refs", { repo }));
      return [repo, {
        ...asStringRecord(refs?.heads),
        ...asStringRecord(refs?.tags),
      }] as const;
    } catch {
      return [repo, {}] as const;
    }
  }));

  return new Map(entries);
}

function describeSourceHealth(
  pkg: PackageLike,
  refsByRepo: Map<string, Record<string, string>>,
): Pick<PackageRecord, "currentHead" | "updateAvailable"> {
  const refs = refsByRepo.get(pkg.source.repo) ?? {};
  const refHead = typeof refs[pkg.source.ref] === "string" ? refs[pkg.source.ref] : null;
  const resolvedCommit = pkg.source.resolvedCommit ?? null;
  return {
    currentHead: refHead,
    updateAvailable: refHead !== null && resolvedCommit !== refHead,
  };
}

function derivePackageView(
  pkg: PackageLike,
  refsByRepo: Map<string, Record<string, string>>,
  viewer: NormalizedViewer,
): DerivedPackageRecord {
  const sourceHealth = describeSourceHealth(pkg, refsByRepo);
  const entrypoints = asArray<PackageEntrypoint>(pkg.entrypoints);
  const declaredSyscalls = unique(entrypoints.flatMap((entry) => asArray<string>(entry.syscalls)));
  const uiEntrypoints = entrypoints.filter((entry) => entry.kind === "ui" && asString(entry.route).length > 0);
  const profiles = asArray<Record<string, unknown>>(pkg.profiles).map((profile) => ({
    name: asString(profile.name),
    displayName: asString(profile.displayName),
    description: asString(profile.description) || undefined,
    icon: asString(profile.icon) || undefined,
  }));
  const canMutate = canMutatePackage(pkg, viewer);
  const canChangeVisibility = viewer.isRoot || repoOwner(pkg.source.repo) === viewer.username;
  const canPullSource = canChangeVisibility && (isBuiltinRepo(pkg.source.repo) || pkg.review.required);

  return {
    ...pkg,
    entrypoints,
    profiles,
    reviewPending: pkg.review.required && !pkg.review.approvedAt,
    reviewed: pkg.review.required && Boolean(pkg.review.approvedAt),
    isBuiltin: isBuiltinRepo(pkg.source.repo),
    declaredSyscalls,
    uiEntrypoints,
    currentHead: sourceHealth.currentHead,
    updateAvailable: sourceHealth.updateAvailable,
    canMutate,
    canChangeVisibility,
    canPullSource,
  };
}

function aggregateSources(packages: DerivedPackageRecord[]): SourceRecord[] {
  const byRepo = new Map<string, SourceRecord & {
    hasImmutablePackages: boolean;
  }>();

  for (const pkg of packages) {
    const current = byRepo.get(pkg.source.repo) ?? {
      repo: pkg.source.repo,
      public: pkg.source.public,
      isBuiltin: pkg.isBuiltin,
      packageIds: [],
      packageNames: [],
      packageCount: 0,
      reviewPendingCount: 0,
      updateCount: 0,
      latestUpdatedAt: 0,
      refreshable: false,
      pullable: pkg.canPullSource,
      canChangeVisibility: pkg.canChangeVisibility,
      hasImmutablePackages: !pkg.canMutate,
    };
    current.public = current.public || pkg.source.public;
    current.packageIds.push(pkg.packageId);
    current.packageNames.push(pkg.name);
    current.packageCount += 1;
    if (pkg.reviewPending) current.reviewPendingCount += 1;
    if (pkg.updateAvailable) current.updateCount += 1;
    current.latestUpdatedAt = Math.max(current.latestUpdatedAt, pkg.updatedAt);
    current.canChangeVisibility = current.canChangeVisibility || pkg.canChangeVisibility;
    current.hasImmutablePackages = current.hasImmutablePackages || !pkg.canMutate;
    current.pullable = current.pullable || pkg.canPullSource;
    byRepo.set(pkg.source.repo, current);
  }

  return [...byRepo.values()]
    .sort((left, right) => left.repo.localeCompare(right.repo))
    .map((source) => ({
      repo: source.repo,
      public: source.public,
      isBuiltin: source.isBuiltin,
      packageIds: source.packageIds,
      packageNames: source.packageNames.sort((left, right) => left.localeCompare(right)),
      packageCount: source.packageCount,
      reviewPendingCount: source.reviewPendingCount,
      updateCount: source.updateCount,
      latestUpdatedAt: source.latestUpdatedAt,
      refreshable: !source.hasImmutablePackages,
      pullable: source.pullable,
      canChangeVisibility: source.canChangeVisibility,
    }));
}

async function loadCatalogs(kernel: KernelClientLike): Promise<CatalogRecord[]> {
  const remotesResult = asRecord(await kernel.request("pkg.remote.list", {}));
  const remotes = asArray<RemoteRecord>(remotesResult?.remotes);

  return Promise.all([
    (async () => {
      try {
        const result = asRecord(await kernel.request("pkg.public.list", {}));
        return {
          name: "local",
          kind: "local" as const,
          packages: normalizeCatalogEntries(result?.packages),
        };
      } catch (error) {
        return {
          name: "local",
          kind: "local" as const,
          packages: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })(),
    ...remotes.map(async (remote) => {
      const name = asString(remote.name);
      const baseUrl = asString(remote.baseUrl);
      try {
        const result = asRecord(await kernel.request("pkg.public.list", { remote: name }));
        return {
          name,
          kind: "remote" as const,
          baseUrl,
          packages: normalizeCatalogEntries(result?.packages),
        };
      } catch (error) {
        return {
          name,
          kind: "remote" as const,
          baseUrl,
          packages: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  ]);
}

function normalizeCatalogEntries(value: unknown): CatalogEntry[] {
  return asArray<Record<string, unknown>>(value).map((entry) => {
    const source = asRecord(entry.source) ?? {};
    return {
      name: asString(entry.name),
      description: asString(entry.description) || undefined,
      version: asString(entry.version) || undefined,
      runtime: asString(entry.runtime) || undefined,
      source: {
        repo: asString(source.repo),
        ref: asString(source.ref),
        subdir: asString(source.subdir),
        resolvedCommit: typeof source.resolvedCommit === "string" ? source.resolvedCommit : null,
      },
      entrypoints: asArray<PackageEntrypoint>(entry.entrypoints),
      profiles: asArray<Record<string, unknown>>(entry.profiles).map((profile) => ({
        name: asString(profile.name),
        displayName: asString(profile.displayName),
        description: asString(profile.description) || undefined,
        icon: asString(profile.icon) || undefined,
      })),
      bindingNames: asArray<string>(entry.bindingNames),
    };
  });
}

async function loadPackageDetail(
  kernel: KernelClientLike,
  pkg: Pick<PackageRecord, "source">,
): Promise<PackageDetail> {
  const [refs, log] = await Promise.all([
    kernel.request("repo.refs", { repo: pkg.source.repo }),
    kernel.request("repo.log", {
      repo: pkg.source.repo,
      ref: pkg.source.ref,
      limit: 20,
      offset: 0,
    }),
  ]);
  const refsRecord = asRecord(refs);
  const logRecord = asRecord(log);
  return {
    refs: {
      activeRef: pkg.source.ref,
      heads: asStringRecord(refsRecord?.heads),
      tags: asStringRecord(refsRecord?.tags),
    },
    commits: asArray<Record<string, unknown>>(logRecord?.entries).map(normalizeCommit),
  };
}

function normalizeCommit(entry: Record<string, unknown>): PackageCommit {
  return {
    hash: asString(entry.hash),
    message: asString(entry.message),
    author: asString(entry.author),
    commitTime: asNumber(entry.commitTime),
  };
}
