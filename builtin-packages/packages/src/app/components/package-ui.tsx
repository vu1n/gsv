import type { PackageRecord } from "../types";
import { formatDate, formatDateTimeAttribute, formatRelativeTime } from "../utils/format";
import { formatScope, packageRiskLabel, packageRiskLevel, packageSurfaceCounts, parseRepoSlug, surfaceTitle } from "../domain/package-model";
import { highlightLine } from "../domain/source-model";

export function PackageBadges({ pkg, compact = false }: { pkg: PackageRecord; compact?: boolean }) {
  return (
    <span class="packages-badge-row">
      <span class={`packages-badge ${pkg.enabled ? "is-enabled" : "is-disabled"}`}>{pkg.enabled ? "Enabled" : "Disabled"}</span>
      {pkg.reviewPending ? <span class="packages-badge is-review">{compact ? "Review" : "Review required"}</span> : null}
      {pkg.updateAvailable ? <span class="packages-badge is-update">{compact ? "Update" : "Update available"}</span> : null}
      {!compact ? <span class="packages-badge">{formatScope(pkg)}</span> : null}
    </span>
  );
}

export function RiskBadge({ pkg }: { pkg: PackageRecord }) {
  const level = packageRiskLevel(pkg);
  return <span class={`packages-badge packages-risk-badge is-${level}`}>{packageRiskLabel(pkg)}</span>;
}

export function PackageSurfaceIcons({ pkg }: { pkg: PackageRecord }) {
  const counts = packageSurfaceCounts(pkg);
  return (
    <span class="packages-surface-icons" aria-label="Package surfaces">
      {counts.ui > 0 ? <SurfaceIcon kind="ui" count={counts.ui} title={surfaceTitle("ui", counts.ui)} /> : null}
      {counts.command > 0 ? <SurfaceIcon kind="command" count={counts.command} title={surfaceTitle("command", counts.command)} /> : null}
      {counts.rpc > 0 ? <SurfaceIcon kind="rpc" count={counts.rpc} title={surfaceTitle("rpc", counts.rpc)} /> : null}
      {counts.http > 0 ? <SurfaceIcon kind="http" count={counts.http} title={surfaceTitle("http", counts.http)} /> : null}
      {counts.profile > 0 ? <SurfaceIcon kind="profile" count={counts.profile} title={surfaceTitle("profile", counts.profile)} /> : null}
      {counts.total === 0 ? <span class="packages-empty-inline">None</span> : null}
    </span>
  );
}

export function SurfaceIcon(props: { kind: "ui" | "command" | "rpc" | "http" | "profile"; count?: number; title: string }) {
  return (
    <span class="packages-surface-icon" title={props.title} aria-label={props.title}>
      <Icon name={props.kind === "ui" ? "app" : props.kind === "command" ? "terminal" : props.kind === "profile" ? "profile" : "network"} />
      {props.count && props.count > 1 ? <small>{props.count}</small> : null}
    </span>
  );
}

export function Icon({ name }: { name: "app" | "terminal" | "profile" | "network" | "folder" | "file" }) {
  if (name === "app") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="M4 9h16"></path><path d="M8 13h3"></path><path d="M14 13h2"></path></svg>;
  }
  if (name === "terminal") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="m8 10 3 2.5L8 15"></path><path d="M13.5 15H17"></path></svg>;
  }
  if (name === "profile") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"></circle><path d="M6.5 19a5.5 5.5 0 0 1 11 0"></path><path d="M18 6l2-2"></path><path d="M20 4l1.5 1.5"></path></svg>;
  }
  if (name === "network") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2"></circle><circle cx="18" cy="7" r="2"></circle><circle cx="18" cy="17" r="2"></circle><path d="m8 11 8-3"></path><path d="m8 13 8 3"></path></svg>;
  }
  if (name === "folder") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6l2 2h9v7.5a2 2 0 0 1-2 2h-15z"></path><path d="M3.5 7.5v-1a1.5 1.5 0 0 1 1.5-1.5h4l2 2"></path></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l3 3V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"></path><path d="M14 3.5V7h3"></path></svg>;
}

export function RepoSlug({ repo, viewerUsername }: { repo: string; viewerUsername: string }) {
  const { owner, name } = parseRepoSlug(repo);
  const ownerLabel = owner === viewerUsername ? "you" : owner;
  return (
    <span class="packages-repo-slug" title={repo}>
      <span>{ownerLabel}</span>
      <strong>{name}</strong>
    </span>
  );
}

export function TimeAgo({ timestamp }: { timestamp: number | null | undefined }) {
  return <time title={formatDate(timestamp)} dateTime={formatDateTimeAttribute(timestamp)}>{formatRelativeTime(timestamp)}</time>;
}

export function SyntaxLine({ path, content }: { path: string; content: string }) {
  return <>{highlightLine(path, content).map((token, index) => <span key={index} class={token.className}>{token.text}</span>)}</>;
}

export function SyntaxCodeBlock({ path, content }: { path: string; content: string }) {
  const lines = content.length > 0
    ? (content.endsWith("\n") ? content.slice(0, -1) : content).split("\n")
    : [""];
  return (
    <div class="packages-code-block" role="region" aria-label={path || "source file"}>
      {lines.map((line, index) => (
        <code key={index} class="packages-code-line">
          <span class="packages-code-line-number">{index + 1}</span>
          <span class="packages-code-line-content">
            <SyntaxLine path={path} content={line} />
          </span>
        </code>
      ))}
    </div>
  );
}
