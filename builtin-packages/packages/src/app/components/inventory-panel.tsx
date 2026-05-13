import { viewDescription, viewTitle } from "../domain/package-model";
import type { PackageRecord, PackagesView } from "../types";
import { PackageBadges, PackageSurfaceIcons, RepoSlug, RiskBadge, TimeAgo } from "./package-ui";

export function InventoryPanel(props: {
  packages: PackageRecord[];
  view: PackagesView;
  query: string;
  viewerUsername: string;
  onOpenPackage: (pkg: PackageRecord) => void;
}) {
  const { packages, view, query, viewerUsername, onOpenPackage } = props;
  return (
    <section class="packages-panel">
      <header class="packages-panel-head">
        <div>
          <p class="packages-eyebrow">{view === "review" ? "Trust queue" : view === "updates" ? "Update queue" : "Inventory"}</p>
          <h2>{viewTitle(view)}</h2>
          <p>{viewDescription(view)}</p>
        </div>
      </header>
      <PackageInventoryTable
        packages={packages}
        query={query}
        viewerUsername={viewerUsername}
        onOpenPackage={onOpenPackage}
      />
    </section>
  );
}

export function PackageInventoryTable(props: {
  packages: PackageRecord[];
  query: string;
  viewerUsername: string;
  onOpenPackage: (pkg: PackageRecord) => void;
}) {
  const { packages, query, viewerUsername, onOpenPackage } = props;
  if (packages.length === 0) {
    return <div class="packages-empty-state">{query ? `No packages match "${query}".` : "No packages in this queue."}</div>;
  }
  return (
    <div class="packages-table packages-inventory-table">
      <div class="packages-table-head">
        <span>Package</span>
        <span>State</span>
        <span>Surfaces</span>
        <span>Risk</span>
        <span>Source</span>
        <span>Updated</span>
      </div>
      {packages.map((pkg) => (
        <button
          key={pkg.packageId}
          class="packages-table-row packages-table-row--button"
          type="button"
          onClick={() => onOpenPackage(pkg)}
        >
          <span class="packages-table-primary" data-label="Package">
            <strong>{pkg.name}</strong>
            <small>{pkg.description || "No description provided."}</small>
          </span>
          <span data-label="State"><PackageBadges pkg={pkg} compact /></span>
          <span data-label="Surfaces"><PackageSurfaceIcons pkg={pkg} /></span>
          <span data-label="Risk"><RiskBadge pkg={pkg} /></span>
          <span data-label="Source"><RepoSlug repo={pkg.source.repo} viewerUsername={viewerUsername} /></span>
          <span data-label="Updated"><TimeAgo timestamp={pkg.updatedAt} /></span>
        </button>
      ))}
    </div>
  );
}
