import type { PackagesRouteView } from "../../navigation/route-state";
import { formatRelativeTime } from "../../utils/format";
import { SourceCodePane } from "./SourceCodeBrowser";
import { SourceIcon, SourcePill } from "./SourceChrome";
import { HistoryPane } from "./SourceHistory";
import { repoKindLabel, repoKindTone, sourceModeLabel } from "./sources-domain";
import type { SourceLinkedPackage } from "./types";
import type { SourcesRuntime } from "./useSources";

export function RepoWorkspace({
  runtime,
  onOpenPackage,
}: {
  runtime: SourcesRuntime;
  onOpenPackage?: (packageId: string, view?: PackagesRouteView) => void;
}) {
  const repo = runtime.selectedRepo;
  if (!repo) {
    return (
      <section class="gsv-source-workspace">
        <div class="gsv-empty-state">
          <h3>No repository selected</h3>
          <p>Visible ripgit repositories will appear here when the gateway knows about them.</p>
        </div>
      </section>
    );
  }

  const refs = runtime.state?.refs;
  const refOptions = refs ? [
    ...Object.keys(refs.heads).sort((left, right) => left.localeCompare(right)),
    ...Object.keys(refs.tags).sort((left, right) => left.localeCompare(right)),
  ] : [runtime.ref || "main"];
  const pullAction = `source:pull:${repo.repo}`;
  const publicAction = `source:public:${repo.repo}`;

  return (
    <section class="gsv-source-workspace" aria-label={`${repo.repo} source repository`}>
      <header class="gsv-source-repo-head">
        <div class="gsv-source-repo-identity">
          <span class="gsv-source-repo-icon"><SourceIcon name="repo" /></span>
          <div>
            <span class="gsv-kicker">{repoKindLabel(repo.kind)}</span>
            <h3><span>{repo.owner}</span> / {repo.name}</h3>
            <p>{repo.description || repo.linkedPackages.map((pkg) => pkg.name).join(", ") || "Ripgit repository"}</p>
          </div>
        </div>
        <div class="gsv-source-actions">
          <button
            type="button"
            class="gsv-action-button"
            disabled={!repo.writable || runtime.pendingAction !== null}
            onClick={() => void runtime.pullRepo()}
          >
            {runtime.pendingAction === pullAction ? "Pulling" : "Pull upstream"}
          </button>
          <button
            type="button"
            class="gsv-action-button"
            disabled={!repo.writable || runtime.pendingAction !== null}
            onClick={() => void runtime.setRepoPublic(!repo.public)}
          >
            {runtime.pendingAction === publicAction ? "Updating" : repo.public ? "Make private" : "Publish"}
          </button>
        </div>
      </header>

      <div class="gsv-source-repo-badges">
        <SourcePill className={repoKindTone(repo.kind)}>{repoKindLabel(repo.kind)}</SourcePill>
        <SourcePill>{repo.public ? "Public" : "Private"}</SourcePill>
        <SourcePill>{repo.writable ? "Writable" : "Read only"}</SourcePill>
        {repo.updatedAt ? <SourcePill>Updated {formatRelativeTime(repo.updatedAt)}</SourcePill> : null}
      </div>

      {repo.linkedPackages.length > 0 ? (
        <div class="gsv-source-package-links" aria-label="Linked packages">
          {repo.linkedPackages.map((pkg) => (
            <LinkedPackageChip key={pkg.packageId} pkg={pkg} onOpenPackage={onOpenPackage} />
          ))}
        </div>
      ) : null}

      {runtime.error ? <p class="gsv-inline-error">{runtime.error}</p> : null}
      {runtime.notice ? <p class="gsv-inline-status">{runtime.notice}</p> : null}

      <nav class="gsv-source-tabs" aria-label="Repository views">
        {(["code", "history"] as const).map((mode) => (
          <button
            type="button"
            key={mode}
            class={runtime.mode === mode ? "is-active" : ""}
            onClick={() => runtime.setMode(mode)}
          >
            {sourceModeLabel(mode)}
          </button>
        ))}
      </nav>

      <section class="gsv-source-browser">
        {runtime.mode === "history" ? (
          <HistoryPane runtime={runtime} />
        ) : (
          <SourceCodePane runtime={runtime} refOptions={refOptions} />
        )}
      </section>
    </section>
  );
}

function LinkedPackageChip({
  pkg,
  onOpenPackage,
}: {
  pkg: SourceLinkedPackage;
  onOpenPackage?: (packageId: string, view?: PackagesRouteView) => void;
}) {
  const view: PackagesRouteView = pkg.reviewPending ? "review" : "inventory";
  return (
    <button
      type="button"
      class="gsv-source-package-chip"
      onClick={() => onOpenPackage?.(pkg.packageId, view)}
      disabled={!onOpenPackage}
    >
      <SourceIcon name="package" />
      {pkg.name}
      {pkg.subdir && pkg.subdir !== "." ? <small>{pkg.subdir}</small> : null}
      {pkg.reviewPending ? <small>review</small> : null}
    </button>
  );
}
