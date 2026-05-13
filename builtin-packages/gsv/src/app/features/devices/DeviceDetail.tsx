import { openApp } from "@gsv/package/host";
import { useEffect, useState } from "preact/hooks";
import { formatNullableTimestamp, groupCapabilities, hasFiles, hasShell, deviceHealthSummary } from "./devices-domain";
import type { DeviceDetail, DeviceToken, DevicesTabId, DevicesViewer } from "./types";

export function DeviceDetailPanel({
  device,
  viewer,
  activeTab,
  tokens,
  pendingAction,
  onTab,
  onBackToFleet,
  onProvision,
  onRevoke,
  onUpdateDescription,
}: {
  device: DeviceDetail | null;
  viewer: DevicesViewer | null;
  activeTab: DevicesTabId;
  tokens: DeviceToken[];
  pendingAction: string | null;
  onTab: (tab: DevicesTabId) => void;
  onBackToFleet: () => void;
  onProvision: (deviceId: string) => void;
  onRevoke: (tokenId: string) => void;
  onUpdateDescription: (deviceId: string, description: string) => void;
}) {
  if (!device) {
    return (
      <section class="gsv-device-detail">
        <div class="gsv-empty-state">
          <h3>No device selected</h3>
          <p>Choose a device from the fleet list or add a new execution target.</p>
        </div>
      </section>
    );
  }

  return (
    <section class="gsv-device-detail" aria-label="Device detail">
      <header class="gsv-device-detail-head">
        <div>
          <span class="gsv-kicker">Fleet detail</span>
          <h3>{device.deviceId}</h3>
          <p>{device.online ? "Online and ready for routing." : "Offline. Review health and access before routing work here."}</p>
        </div>
        <div class="gsv-device-actions">
          <button class="gsv-mini-button gsv-device-compact-back" type="button" onClick={onBackToFleet}>
            Back to fleet
          </button>
          <button class="gsv-mini-button" type="button" disabled={!hasFiles(device)} onClick={() => openApp({ target: "files", payload: { device: device.deviceId, path: "." } })}>
            Files
          </button>
          <button class="gsv-mini-button" type="button" disabled={!hasShell(device)} onClick={() => openApp({ target: "shell", payload: { device: device.deviceId, cwd: "." } })}>
            Shell
          </button>
          {viewer?.canManageTokens ? (
            <button class="gsv-mini-button" type="button" onClick={() => onProvision(device.deviceId)}>Add access</button>
          ) : null}
        </div>
      </header>

      <nav class="gsv-local-tabs" aria-label="Device tabs">
        {([
          ["overview", "Overview"],
          ["capabilities", "Capabilities"],
          ["access", "Access"],
          ["health", "Health"],
        ] as Array<[DevicesTabId, string]>).map(([tab, label]) => (
          <button key={tab} type="button" class={activeTab === tab ? "is-active" : ""} onClick={() => onTab(tab)}>
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "overview" ? (
        <DeviceOverview
          device={device}
          canEdit={Boolean(viewer && (viewer.uid === 0 || viewer.uid === device.ownerUid))}
          pending={pendingAction === "update-description"}
          onUpdateDescription={(description) => onUpdateDescription(device.deviceId, description)}
        />
      ) : null}
      {activeTab === "capabilities" ? <DeviceCapabilities device={device} /> : null}
      {activeTab === "access" ? <DeviceAccess viewer={viewer} device={device} tokens={tokens} pendingAction={pendingAction} onProvision={onProvision} onRevoke={onRevoke} /> : null}
      {activeTab === "health" ? <DeviceHealth device={device} /> : null}
    </section>
  );
}

function DeviceOverview({
  device,
  canEdit,
  pending,
  onUpdateDescription,
}: {
  device: DeviceDetail;
  canEdit: boolean;
  pending: boolean;
  onUpdateDescription: (description: string) => void;
}) {
  const [description, setDescription] = useState(device.description);
  const changed = description.trim() !== device.description.trim();

  useEffect(() => {
    setDescription(device.description);
  }, [device.deviceId, device.description]);

  return (
    <section class="gsv-device-tab">
      <div class="gsv-device-note">
        <label>
          <span>Device note</span>
          <textarea
            value={description}
            maxLength={500}
            readOnly={!canEdit}
            disabled={pending}
            placeholder="Personal MacBook used for local work"
            onInput={(event) => setDescription(event.currentTarget.value)}
          />
        </label>
        <div class="gsv-device-note-actions">
          <span>{description.length}/500</span>
          <button class="gsv-mini-button" type="button" disabled={!canEdit || pending || !changed} onClick={() => onUpdateDescription(description)}>
            {pending ? "Saving" : "Save note"}
          </button>
        </div>
      </div>

      <div class="gsv-summary-grid">
        <Info label="Status" value={device.online ? "Ready" : "Offline"} />
        <Info label="Platform" value={device.platform || "Unknown"} />
        <Info label="Version" value={device.version || "Unknown"} />
        <Info label="Owner" value={`uid ${device.ownerUid}`} />
        <Info label="First seen" value={formatNullableTimestamp(device.firstSeenAt)} />
        <Info label="Last seen" value={formatNullableTimestamp(device.lastSeenAt)} />
        <Info label="Shell" value={hasShell(device) ? "Available" : "Unavailable"} />
        <Info label="Files" value={hasFiles(device) ? "Available" : "Unavailable"} />
      </div>
    </section>
  );
}

function DeviceCapabilities({ device }: { device: DeviceDetail }) {
  const groups = groupCapabilities(device.implements);
  return (
    <section class="gsv-device-tab">
      <div class="gsv-capability-groups">
        {groups.map((group) => (
          <section key={group.name} class="gsv-capability-group">
            <header>
              <h4>{group.name}</h4>
              <span>{group.items.length} capability{group.items.length === 1 ? "" : "ies"}</span>
            </header>
            <div>{group.items.map((item) => <code key={item}>{item}</code>)}</div>
          </section>
        ))}
      </div>
    </section>
  );
}

function DeviceAccess({
  viewer,
  device,
  tokens,
  pendingAction,
  onProvision,
  onRevoke,
}: {
  viewer: DevicesViewer | null;
  device: DeviceDetail;
  tokens: DeviceToken[];
  pendingAction: string | null;
  onProvision: (deviceId: string) => void;
  onRevoke: (tokenId: string) => void;
}) {
  return (
    <section class="gsv-device-tab">
      <div class="gsv-device-access-head">
        <span>{tokens.length} node token{tokens.length === 1 ? "" : "s"}</span>
        {viewer?.canManageTokens ? <button class="gsv-mini-button" type="button" onClick={() => onProvision(device.deviceId)}>Issue token</button> : null}
      </div>
      <div class="gsv-token-list">
        {tokens.length === 0 ? (
          <section class="gsv-empty-state"><h3>No node tokens</h3><p>No node tokens are issued for this device.</p></section>
        ) : tokens.map((token) => {
          const revoked = typeof token.revokedAt === "number";
          return (
            <article class="gsv-token-row" key={token.tokenId}>
              <span class={`gsv-mark is-${revoked ? "warning" : "good"}`} aria-hidden="true"></span>
              <span class="gsv-row-copy">
                <strong>{token.tokenPrefix}</strong>
                <span>{token.label || device.deviceId} / {revoked ? "revoked" : "active"}</span>
                <span>created {formatNullableTimestamp(token.createdAt)}</span>
                <span>last used {formatNullableTimestamp(token.lastUsedAt)}</span>
                <span>expires {formatNullableTimestamp(token.expiresAt)}</span>
              </span>
              {viewer?.canManageTokens && !revoked ? (
                <button class="gsv-mini-button" type="button" disabled={pendingAction === `revoke:${token.tokenId}`} onClick={() => onRevoke(token.tokenId)}>
                  Revoke
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DeviceHealth({ device }: { device: DeviceDetail }) {
  return (
    <section class="gsv-device-tab">
      <div class={`gsv-health-banner${device.online ? " is-ready" : " is-warning"}`}>
        <strong>{device.online ? "Ready" : "Needs attention"}</strong>
        <span>{deviceHealthSummary(device)}</span>
      </div>
      <dl class="gsv-detail-list">
        <div><dt>Last heartbeat</dt><dd>{new Date(device.lastSeenAt).toLocaleString()}</dd></div>
        <div><dt>Connected</dt><dd>{formatNullableTimestamp(device.connectedAt)}</dd></div>
        <div><dt>Disconnected</dt><dd>{formatNullableTimestamp(device.disconnectedAt)}</dd></div>
        <div><dt>Capabilities</dt><dd>{device.implements.length}</dd></div>
      </dl>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div class="gsv-info-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
