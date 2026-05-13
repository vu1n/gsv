import { openApp } from "@gsv/package/host";
import {
  Icon,
  PackageBadges,
  PackageSurfaceIcons,
  RepoSlug,
  RiskBadge,
  SurfaceIcon,
  SyntaxCodeBlock,
  SyntaxLine,
  TimeAgo,
} from "./package-ui";
import {
  buildPermissionSummary,
  formatRepoDisplay,
  formatScope,
  packageRiskDescription,
  packageRiskLabel,
  sourcePathForPackage,
  surfaceTitle,
} from "../domain/package-model";
import {
  buildBreadcrumbs,
  diffStatusClass,
  labelForDiffStatus,
  parentPath,
  prefixForDiffLine,
  sortTreeEntries,
} from "../domain/source-model";
import { appIdFromRoute } from "../routing";
import type {
  PackageCommit,
  PackageDetailTab,
  PackageRecord,
  PackageRepoDiffFile,
  PackageRepoDiffResult,
  PackageRepoReadResult,
  PackageRepoRoot,
  PackageRepoSearchResult,
  PackagesState,
} from "../types";
import { firstLine, formatBytes, shortHash } from "../utils/format";

export function PackageDetailView(props: {
  pkg: PackageRecord;
  state: PackagesState | null;
  viewerUsername: string;
  activeTab: PackageDetailTab;
  pendingAction: string | null;
  packageMutationBlockedReason: string;
  packageVisibilityBlockedReason: string;
  packagePullBlockedReason: string;
  browseRefs: string[];
  checkoutRef: string;
  setCheckoutRef: (value: string) => void;
  selectedCommit: string | null;
  selectedCommitRecord: PackageCommit | null;
  diffBusy: boolean;
  diffError: string | null;
  diffResult: PackageRepoDiffResult | null;
  codeRoot: PackageRepoRoot;
  codeRef: string;
  codePath: string;
  codeRead: PackageRepoReadResult | null;
  codeBusy: boolean;
  codeError: string | null;
  codeSearch: string;
  codeSearchBusy: boolean;
  codeSearchResult: PackageRepoSearchResult | null;
  onBack: () => void;
  onTab: (tab: PackageDetailTab) => void;
  onEnable: (packageId: string) => void;
  onDisable: (packageId: string) => void;
  onApprove: (packageId: string) => void;
  onRefresh: (packageId: string) => void;
  onPull: (packageId: string) => void;
  onSetPublic: (payload: { packageId?: string; repo?: string; public: boolean }) => void;
  onStartReview: (packageId: string) => void;
  onCheckout: (packageId: string) => void;
  onSelectCommit: (hash: string) => void;
  setCodeRoot: (value: PackageRepoRoot) => void;
  setCodeRef: (value: string) => void;
  setCodePath: (value: string) => void;
  setCodeSearch: (value: string) => void;
  setCodeSearchResult: (value: PackageRepoSearchResult | null) => void;
  handleSearchRepo: () => void;
}) {
  const { pkg, activeTab } = props;
  const entryActions = renderEntryActions(pkg);
  return (
    <section class="packages-detail">
      <header class="packages-detail-head">
        <div>
          <button class="packages-link-button" type="button" onClick={props.onBack}>Back to inventory</button>
          <p class="packages-eyebrow">{formatScope(pkg)} package</p>
          <h2>{pkg.name}</h2>
          <p>{pkg.description || "No description provided."}</p>
          <div class="packages-badge-row">
            <PackageBadges pkg={pkg} />
            <RiskBadge pkg={pkg} />
          </div>
        </div>
        <div class="packages-action-stack">
          {entryActions}
          <button class="packages-button" type="button" disabled={props.pendingAction === `review:${pkg.packageId}`} onClick={() => props.onStartReview(pkg.packageId)}>Review in Chat</button>
          {pkg.reviewPending ? (
            <button
              class="packages-button packages-button--primary"
              type="button"
              title={props.packageMutationBlockedReason || undefined}
              disabled={!pkg.canMutate || props.pendingAction === `approve:${pkg.packageId}`}
              onClick={() => props.onApprove(pkg.packageId)}
            >
              Approve review
            </button>
          ) : null}
          {pkg.enabled ? (
            <button
              class="packages-button packages-button--danger"
              type="button"
              title={props.packageMutationBlockedReason || undefined}
              disabled={!pkg.canMutate || props.pendingAction === `disable:${pkg.packageId}`}
              onClick={() => props.onDisable(pkg.packageId)}
            >
              Disable
            </button>
          ) : !pkg.reviewPending ? (
            <button
              class="packages-button packages-button--primary"
              type="button"
              title={props.packageMutationBlockedReason || undefined}
              disabled={!pkg.canMutate || props.pendingAction === `enable:${pkg.packageId}`}
              onClick={() => props.onEnable(pkg.packageId)}
            >
              Enable
            </button>
          ) : null}
          <button
            class="packages-button"
            type="button"
            title={props.packageMutationBlockedReason || undefined}
            disabled={!pkg.canMutate || props.pendingAction === `refresh:${pkg.packageId}`}
            onClick={() => props.onRefresh(pkg.packageId)}
          >
            Sync package
          </button>
          <button
            class="packages-button"
            type="button"
            title={props.packagePullBlockedReason || undefined}
            disabled={!pkg.canPullSource || props.pendingAction === `pull:${pkg.packageId}`}
            onClick={() => props.onPull(pkg.packageId)}
          >
            Pull upstream
          </button>
          {!pkg.isBuiltin ? (
            <button
              class="packages-button"
              type="button"
              title={props.packageVisibilityBlockedReason || undefined}
              disabled={!pkg.canChangeVisibility || props.pendingAction === `public:${pkg.packageId}`}
              onClick={() => props.onSetPublic({ packageId: pkg.packageId, public: !pkg.source.public })}
            >
              {pkg.source.public ? "Hide source" : "Publish source"}
            </button>
          ) : null}
        </div>
      </header>

      <PackageSignalStrip pkg={pkg} viewerUsername={props.viewerUsername} />

      <nav class="packages-tabbar" aria-label="Package detail tabs">
        {([
          ["summary", "Summary"],
          ["source", "Source"],
          ["permissions", "Permissions"],
          ["review", "Review"],
        ] as Array<[PackageDetailTab, string]>).map(([tab, label]) => (
          <button key={tab} class={`packages-tab${activeTab === tab ? " is-active" : ""}`} type="button" onClick={() => props.onTab(tab)}>{label}</button>
        ))}
      </nav>

      <div class="packages-detail-body">
        {activeTab === "summary" ? <SummaryTab pkg={pkg} viewerUsername={props.viewerUsername} /> : null}
        {activeTab === "permissions" ? <PermissionsTab pkg={pkg} /> : null}
        {activeTab === "review" ? (
          <ReviewTab
            pkg={pkg}
            pendingAction={props.pendingAction}
            packageMutationBlockedReason={props.packageMutationBlockedReason}
            onStartReview={props.onStartReview}
            onApprove={props.onApprove}
          />
        ) : null}
        {activeTab === "source" ? (
          <SourceWorkbench
            pkg={pkg}
            detail={props.state?.packageDetail ?? null}
            browseRefs={props.browseRefs}
            checkoutRef={props.checkoutRef}
            setCheckoutRef={props.setCheckoutRef}
            pendingAction={props.pendingAction}
            packageMutationBlockedReason={props.packageMutationBlockedReason}
            onCheckout={props.onCheckout}
            selectedCommit={props.selectedCommit}
            selectedCommitRecord={props.selectedCommitRecord}
            diffBusy={props.diffBusy}
            diffError={props.diffError}
            diffResult={props.diffResult}
            onSelectCommit={props.onSelectCommit}
            codeRoot={props.codeRoot}
            codeRef={props.codeRef}
            codePath={props.codePath}
            codeRead={props.codeRead}
            codeBusy={props.codeBusy}
            codeError={props.codeError}
            codeSearch={props.codeSearch}
            codeSearchBusy={props.codeSearchBusy}
            codeSearchResult={props.codeSearchResult}
            setCodeRoot={props.setCodeRoot}
            setCodeRef={props.setCodeRef}
            setCodePath={props.setCodePath}
            setCodeSearch={props.setCodeSearch}
            setCodeSearchResult={props.setCodeSearchResult}
            handleSearchRepo={props.handleSearchRepo}
          />
        ) : null}
      </div>
    </section>
  );
}

function PackageSignalStrip({ pkg, viewerUsername }: { pkg: PackageRecord; viewerUsername: string }) {
  return (
    <section class="packages-signal-strip">
      <div class="packages-signal-group" aria-label="Package surfaces">
        <PackageSurfaceIcons pkg={pkg} />
      </div>
      <div class="packages-signal-group">
        <span class="packages-signal-label">Source</span>
        <RepoSlug repo={pkg.source.repo} viewerUsername={viewerUsername} />
        <span class="packages-ref-chip">{pkg.source.ref}</span>
      </div>
      <div class="packages-signal-group">
        <span class="packages-signal-label">Commit</span>
        <span class="packages-mono" title={`Installed ${pkg.source.resolvedCommit ?? "unknown"}`}>{shortHash(pkg.source.resolvedCommit)}</span>
        <span class="packages-muted-arrow">to</span>
        <span class="packages-mono" title={`Head ${pkg.currentHead ?? "unknown"}`}>{shortHash(pkg.currentHead)}</span>
      </div>
      <div class="packages-signal-group">
        <RiskBadge pkg={pkg} />
        <PackageBadges pkg={pkg} compact />
      </div>
    </section>
  );
}

function SummaryTab({ pkg, viewerUsername }: { pkg: PackageRecord; viewerUsername: string }) {
  return (
    <section class="packages-section-stack">
      <div class="packages-info-grid">
        <InfoItem label="Version" value={pkg.version} />
        <InfoItem label="Scope" value={formatScope(pkg)} />
        <InfoItem label="Visibility" value={pkg.source.public ? "Public" : "Private"} />
        <InfoItem label="Repo" value={formatRepoDisplay(pkg.source.repo, viewerUsername)} />
        <InfoItem label="Ref" value={pkg.source.ref} mono />
        <InfoItem label="Subdir" value={pkg.source.subdir} mono />
      </div>

      <section class="packages-subsection">
        <header>
          <h3>Entrypoints</h3>
          <p>Launch surfaces, commands, and RPC surfaces exposed by this package.</p>
        </header>
        <div class="packages-table packages-entrypoint-table">
          <div class="packages-table-head">
            <span>Name</span>
            <span>Kind</span>
            <span>Details</span>
          </div>
          {pkg.entrypoints.length === 0 ? <div class="packages-empty-state">No entrypoints declared.</div> : pkg.entrypoints.map((entry) => (
            <div key={`${entry.name}:${entry.kind}`} class="packages-table-row">
              <span class="packages-table-primary" data-label="Name">
                <strong>{entry.name}</strong>
                <small>{entry.description || "No description"}</small>
              </span>
              <span data-label="Kind"><SurfaceIcon kind={entry.kind} title={surfaceTitle(entry.kind, 1)} /></span>
              <span class="packages-mono" data-label="Details">{entry.route || (entry.syscalls?.join(", ") || "-")}</span>
            </div>
          ))}
        </div>
      </section>
      {pkg.profiles.length > 0 ? (
        <section class="packages-subsection">
          <header>
            <h3>AI Profiles</h3>
            <p>Reusable process profiles exported by this package.</p>
          </header>
          <div class="packages-chip-row">
            {pkg.profiles.map((profile) => (
              <span key={profile.name} class="packages-chip" title={profile.description || profile.name}>
                <Icon name="profile" />
                {profile.displayName || profile.name}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

export function InfoItem(props: { label: string; value: string; mono?: boolean }) {
  return (
    <article>
      <span>{props.label}</span>
      <strong class={props.mono ? "packages-mono" : ""}>{props.value}</strong>
    </article>
  );
}

function PermissionsTab({ pkg }: { pkg: PackageRecord }) {
  const summary = buildPermissionSummary(pkg);
  return (
    <section class="packages-section-stack">
      <section class="packages-risk-panel">
        <div>
          <p class="packages-eyebrow">Capability risk</p>
          <h3>{packageRiskLabel(pkg)}</h3>
          <p>{packageRiskDescription(pkg)}</p>
        </div>
        <RiskBadge pkg={pkg} />
      </section>
      <section class="packages-subsection">
        <header>
          <h3>Impact Summary</h3>
          <p>Curated interpretation of declared bindings and syscalls.</p>
        </header>
        <ul class="packages-bullet-list">
          {summary.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
      <div class="packages-columns">
        <section class="packages-subsection">
          <header>
            <h3>Bindings</h3>
            <p>Runtime bindings requested by the package.</p>
          </header>
          <ChipList items={pkg.bindingNames} empty="No declared bindings." />
        </section>
        <section class="packages-subsection">
          <header>
            <h3>Syscalls</h3>
            <p>Entry-point syscall surfaces declared by the package.</p>
          </header>
          <ChipList items={pkg.declaredSyscalls} empty="No declared syscalls." />
        </section>
      </div>
    </section>
  );
}

function ChipList({ items, empty }: { items: string[]; empty: string }) {
  return (
    <div class="packages-chip-row">
      {items.length > 0 ? items.map((item) => <span key={item} class="packages-chip">{item}</span>) : <span class="packages-empty-inline">{empty}</span>}
    </div>
  );
}

function ReviewTab(props: {
  pkg: PackageRecord;
  pendingAction: string | null;
  packageMutationBlockedReason: string;
  onStartReview: (packageId: string) => void;
  onApprove: (packageId: string) => void;
}) {
  const { pkg } = props;
  return (
    <section class="packages-section-stack">
      <div class="packages-info-grid">
        <InfoItem label="Review required" value={pkg.review.required ? "Yes" : "No"} />
        <article>
          <span>Approved</span>
          <strong>{pkg.review.approvedAt ? <TimeAgo timestamp={pkg.review.approvedAt} /> : "Not yet"}</strong>
        </article>
        <InfoItem label="Update state" value={pkg.updateAvailable ? "Behind source head" : "Current"} />
        <InfoItem label="Head commit" value={shortHash(pkg.currentHead)} mono />
      </div>
      <section class="packages-subsection packages-review-flow">
        <header>
          <h3>Review Gate</h3>
          <p>Approve only after source, diff, and capability risk are understood.</p>
        </header>
        <ol>
          <li>Inspect source entrypoints and manifest.</li>
          <li>Compare installed commit with source head when updates exist.</li>
          <li>Review permissions for shell, filesystem, process, package, token, and config access.</li>
          <li>Run the review process when the source or capability profile is unfamiliar.</li>
        </ol>
        <div class="packages-inline-actions">
          <button class="packages-button" type="button" disabled={props.pendingAction === `review:${pkg.packageId}`} onClick={() => props.onStartReview(pkg.packageId)}>Review in Chat</button>
          {pkg.reviewPending ? (
            <button
              class="packages-button packages-button--primary"
              type="button"
              title={props.packageMutationBlockedReason || undefined}
              disabled={!pkg.canMutate || props.pendingAction === `approve:${pkg.packageId}`}
              onClick={() => props.onApprove(pkg.packageId)}
            >
              Approve review
            </button>
          ) : null}
        </div>
      </section>
    </section>
  );
}

function SourceWorkbench(props: {
  pkg: PackageRecord;
  detail: PackagesState["packageDetail"] | null;
  browseRefs: string[];
  checkoutRef: string;
  setCheckoutRef: (value: string) => void;
  pendingAction: string | null;
  packageMutationBlockedReason: string;
  onCheckout: (packageId: string) => void;
  selectedCommit: string | null;
  selectedCommitRecord: PackageCommit | null;
  diffBusy: boolean;
  diffError: string | null;
  diffResult: PackageRepoDiffResult | null;
  onSelectCommit: (hash: string) => void;
  codeRoot: PackageRepoRoot;
  codeRef: string;
  codePath: string;
  codeRead: PackageRepoReadResult | null;
  codeBusy: boolean;
  codeError: string | null;
  codeSearch: string;
  codeSearchBusy: boolean;
  codeSearchResult: PackageRepoSearchResult | null;
  setCodeRoot: (value: PackageRepoRoot) => void;
  setCodeRef: (value: string) => void;
  setCodePath: (value: string) => void;
  setCodeSearch: (value: string) => void;
  setCodeSearchResult: (value: PackageRepoSearchResult | null) => void;
  handleSearchRepo: () => void;
}) {
  const commits = props.detail?.commits ?? [];
  const openPath = (path: string) => {
    props.setCodePath(path);
    props.setCodeSearchResult(null);
  };
  return (
    <section class="packages-source-workbench">
      <header class="packages-source-toolbar">
        <div>
          <p class="packages-eyebrow">Mounted source</p>
          <h3>{sourcePathForPackage(props.pkg)}</h3>
          <p>Repository source is mounted for processes. Writable owned sources stage changes before explicit commit.</p>
        </div>
        <div class="packages-ref-controls">
          <label>
            <span>Browse ref</span>
            <select value={props.codeRef} onChange={(event) => { props.setCodeRef((event.currentTarget as HTMLSelectElement).value); props.setCodePath(""); props.setCodeSearchResult(null); }}>
              {props.browseRefs.map((ref) => <option key={ref} value={ref}>{ref}</option>)}
            </select>
          </label>
          <label>
            <span>Installed ref</span>
            <select value={props.checkoutRef} onChange={(event) => props.setCheckoutRef((event.currentTarget as HTMLSelectElement).value)}>
              {props.browseRefs.map((ref) => <option key={ref} value={ref}>{ref}</option>)}
            </select>
          </label>
          <button
            class="packages-button"
            type="button"
            title={props.packageMutationBlockedReason || undefined}
            disabled={!props.pkg.canMutate || props.pendingAction === `checkout:${props.pkg.packageId}` || !props.checkoutRef}
            onClick={() => props.onCheckout(props.pkg.packageId)}
          >
            Use ref
          </button>
        </div>
      </header>

      <section class="packages-source-grid">
        <section class="packages-source-browser">
          <div class="packages-source-browser-head">
            <div class="packages-segmented">
              <button class={`packages-segment${props.codeRoot === "package" ? " is-active" : ""}`} type="button" onClick={() => { props.setCodeRoot("package"); props.setCodePath(""); props.setCodeSearchResult(null); }}>Package root</button>
              <button class={`packages-segment${props.codeRoot === "repo" ? " is-active" : ""}`} type="button" onClick={() => { props.setCodeRoot("repo"); props.setCodePath(""); props.setCodeSearchResult(null); }}>Full repo</button>
            </div>
            <button class="packages-button" type="button" disabled={!props.codePath} onClick={() => openPath(parentPath(props.codePath))}>Up</button>
          </div>
          <form
            class="packages-search-row"
            onSubmit={(event) => {
              event.preventDefault();
              props.handleSearchRepo();
            }}
          >
            <input value={props.codeSearch} onInput={(event) => props.setCodeSearch((event.currentTarget as HTMLInputElement).value)} placeholder="Search source" />
            <button class="packages-button" type="submit" disabled={props.codeSearchBusy}>{props.codeSearchBusy ? "Searching" : "Search"}</button>
          </form>
          <div class="packages-breadcrumbs">
            <button class="packages-breadcrumb" type="button" onClick={() => openPath("")}>{props.codeRoot === "package" ? "Package" : "Repo"}</button>
            {buildBreadcrumbs(props.codePath).map((crumb) => (
              <button key={crumb.path} class="packages-breadcrumb" type="button" onClick={() => openPath(crumb.path)}>{crumb.label}</button>
            ))}
          </div>
          <SourceReadPanel {...props} setCodePath={openPath} />
        </section>

        <section class="packages-source-history">
          <header>
            <div>
              <h3>History and Diff</h3>
              <p>Recent commits and selected commit changes.</p>
            </div>
            <div class="packages-ref-summary">
              <span>Installed <strong class="packages-mono">{shortHash(props.pkg.source.resolvedCommit)}</strong></span>
              <span>Head <strong class="packages-mono">{shortHash(props.pkg.currentHead)}</strong></span>
            </div>
          </header>
          <div class="packages-commit-list">
            {commits.length === 0 ? <div class="packages-empty-state">No commit history available.</div> : commits.map((commit) => (
              <button key={commit.hash} class={`packages-commit-row${props.selectedCommit === commit.hash ? " is-active" : ""}`} type="button" onClick={() => props.onSelectCommit(commit.hash)}>
                <strong>{firstLine(commit.message)}</strong>
                <span class="packages-mono">{shortHash(commit.hash)}</span>
                <small>{commit.author} - <TimeAgo timestamp={commit.commitTime * 1000} /></small>
              </button>
            ))}
          </div>
          {props.selectedCommitRecord ? (
            <div class="packages-selected-commit">
              <strong>{firstLine(props.selectedCommitRecord.message)}</strong>
              <span>{props.selectedCommitRecord.author} - <TimeAgo timestamp={props.selectedCommitRecord.commitTime * 1000} /></span>
            </div>
          ) : null}
          {props.diffBusy ? <div class="packages-empty-state">Loading diff...</div> : null}
          {props.diffError ? <div class="packages-empty-state">{props.diffError}</div> : null}
          {!props.diffBusy && !props.diffError && props.diffResult ? (
            <div class="packages-diff-area">
              <div class="packages-diff-stats">
                <InfoItem label="Files" value={String(props.diffResult.stats.filesChanged)} />
                <InfoItem label="Additions" value={String(props.diffResult.stats.additions)} />
                <InfoItem label="Deletions" value={String(props.diffResult.stats.deletions)} />
              </div>
              {props.diffResult.files.map((file) => <DiffFileView key={`${props.diffResult?.commitHash}:${file.path}`} file={file} />)}
              {props.diffResult.files.length === 0 ? <div class="packages-empty-state">No changed files in this diff.</div> : null}
            </div>
          ) : null}
        </section>
      </section>
    </section>
  );
}

function SourceReadPanel(props: {
  codeRead: PackageRepoReadResult | null;
  codeBusy: boolean;
  codeError: string | null;
  codeSearchResult: PackageRepoSearchResult | null;
  setCodePath: (value: string) => void;
}) {
  if (props.codeSearchResult) {
    return (
      <section class="packages-search-results">
        <header>
          <strong>Search results</strong>
          <span>{props.codeSearchResult.matches.length} match{props.codeSearchResult.matches.length === 1 ? "" : "es"}</span>
        </header>
        {props.codeSearchResult.truncated ? <div class="packages-empty-inline">Search results truncated.</div> : null}
        {props.codeSearchResult.matches.length === 0 ? <div class="packages-empty-state">No source matches found.</div> : null}
        {props.codeSearchResult.matches.map((match) => (
          <button key={`${match.path}:${match.line}:${match.content}`} class="packages-search-result" type="button" onClick={() => props.setCodePath(match.path)}>
            <strong>{match.path}</strong>
            <span>Line {match.line}</span>
            <code>{match.content}</code>
          </button>
        ))}
      </section>
    );
  }
  if (props.codeBusy) return <div class="packages-empty-state">Loading source...</div>;
  if (props.codeError) return <div class="packages-empty-state">{props.codeError}</div>;
  if (props.codeRead?.kind === "tree") {
    return (
      <div class="packages-directory-view">
        {props.codeRead.entries.length === 0 ? <div class="packages-empty-state">This directory is empty.</div> : null}
        {sortTreeEntries(props.codeRead.entries).map((entry) => (
          <button key={entry.path} class="packages-directory-row" type="button" onClick={() => props.setCodePath(entry.path)}>
            <span class="packages-file-label"><Icon name={entry.type === "tree" ? "folder" : "file"} />{entry.name}</span>
            <small class="packages-mono">{entry.hash.slice(0, 7)}</small>
          </button>
        ))}
      </div>
    );
  }
  if (props.codeRead?.kind === "file") {
    return (
      <article class="packages-file-view">
        <header>
          <div>
            <strong class="packages-file-label"><Icon name="file" />{props.codeRead.path || "/"}</strong>
            <span>{formatBytes(props.codeRead.size)} - {props.codeRead.isBinary ? "binary" : "text"}</span>
          </div>
          <button class="packages-button" type="button" onClick={() => props.setCodePath(parentPath(props.codeRead?.path ?? ""))}>Directory</button>
        </header>
        {props.codeRead.isBinary ? (
          <div class="packages-empty-state">This file is binary and cannot be previewed inline.</div>
        ) : (
          <SyntaxCodeBlock path={props.codeRead.path} content={props.codeRead.content ?? ""} />
        )}
      </article>
    );
  }
  return <div class="packages-empty-state">Choose a source path to inspect.</div>;
}

function DiffFileView({ file }: { file: PackageRepoDiffFile }) {
  return (
    <article class="packages-diff-file">
      <header>
        <strong>{file.path}</strong>
        <span class={`packages-badge ${diffStatusClass(file.status)}`}>{labelForDiffStatus(file.status)}</span>
      </header>
      {file.hunks && file.hunks.length > 0 ? file.hunks.map((hunk) => (
        <section key={`${file.path}:${hunk.oldStart}:${hunk.newStart}`} class="packages-diff-hunk">
          <div class="packages-diff-hunk-head">@@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@</div>
          <div class="packages-diff-block">
            {hunk.lines.map((line, index) => (
              <code key={index} class={`packages-diff-line is-${line.tag}`}>
                <span class="packages-diff-prefix">{prefixForDiffLine(line.tag)}</span>
                <span class="packages-diff-content">
                  <SyntaxLine path={file.path} content={line.content} />
                </span>
              </code>
            ))}
          </div>
        </section>
      )) : <div class="packages-empty-state">No text hunks available for this file.</div>}
    </article>
  );
}

function renderEntryActions(pkg: PackageRecord) {
  return pkg.uiEntrypoints.flatMap((entrypoint) => {
    const route = entrypoint.route?.trim();
    if (!route) return [];
    const appId = appIdFromRoute(route) || pkg.name;
    return [
      <button key={`${entrypoint.name}:${route}`} class="packages-button" type="button" onClick={() => openCompanion(appId, route)}>
        {pkg.uiEntrypoints.length === 1 ? "Open app" : `Open ${entrypoint.name}`}
      </button>,
    ];
  });
}

function openCompanion(appId: string, route: string) {
  openApp({ target: appId, payload: route ? { route } : {} });
}
