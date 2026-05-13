export type PackagesView = "inventory" | "updates" | "review";
export type PackageScopeFilter = "all" | "mine" | "system";

export type PackageEntrypoint = {
  name: string;
  kind: "command" | "http" | "rpc" | "ui";
  description?: string;
  command?: string;
  route?: string;
  syscalls?: string[];
};

export type PackageProfile = {
  name: string;
  displayName: string;
  description?: string;
  icon?: string;
};

export type PackageRecord = {
  packageId: string;
  scope: {
    kind: "global" | "user" | "workspace";
    uid?: number;
    workspaceId?: string;
  };
  name: string;
  description: string;
  version: string;
  runtime: string;
  enabled: boolean;
  source: {
    repo: string;
    ref: string;
    subdir: string;
    resolvedCommit?: string | null;
    public: boolean;
  };
  entrypoints: PackageEntrypoint[];
  profiles: PackageProfile[];
  bindingNames: string[];
  review: {
    required: boolean;
    approvedAt: number | null;
  };
  installedAt: number;
  updatedAt: number;
  reviewPending: boolean;
  reviewed: boolean;
  isBuiltin: boolean;
  declaredSyscalls: string[];
  uiEntrypoints: PackageEntrypoint[];
  currentHead: string | null;
  updateAvailable: boolean;
  canMutate: boolean;
  canChangeVisibility: boolean;
  canPullSource: boolean;
};

export type SourceRecord = {
  repo: string;
  public: boolean;
  isBuiltin: boolean;
  packageIds: string[];
  packageNames: string[];
  packageCount: number;
  reviewPendingCount: number;
  updateCount: number;
  latestUpdatedAt: number;
  refreshable: boolean;
  pullable: boolean;
  canChangeVisibility: boolean;
};

export type CatalogEntry = {
  name: string;
  description?: string;
  version?: string;
  runtime?: string;
  source: {
    repo: string;
    ref: string;
    subdir: string;
    resolvedCommit?: string | null;
  };
  entrypoints: PackageEntrypoint[];
  profiles: PackageProfile[];
  bindingNames: string[];
};

export type CatalogRecord = {
  name: string;
  kind: "local" | "remote";
  baseUrl?: string;
  packages: CatalogEntry[];
  error?: string;
};

export type PackageCommit = {
  hash: string;
  message: string;
  author: string;
  commitTime: number;
};

export type PackageDetail = {
  refs: {
    activeRef: string;
    heads: Record<string, string>;
    tags: Record<string, string>;
  };
  commits: PackageCommit[];
};

export type PackagesState = {
  viewer: {
    uid: number;
    username: string;
    isRoot: boolean;
  };
  packages: PackageRecord[];
  sources: SourceRecord[];
  catalogs: CatalogRecord[];
  counts: {
    installed: number;
    review: number;
    updates: number;
  };
  packageDetail: PackageDetail | null;
};

export type LoadPackagesStateArgs = {
  packageId?: string;
};
