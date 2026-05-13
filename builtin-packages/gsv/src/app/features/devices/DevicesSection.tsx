import { useEffect, useState } from "preact/hooks";
import type { GsvBackend } from "../../backend-contract";
import { DeviceDetailPanel } from "./DeviceDetail";
import { DeviceFleetPane } from "./DeviceFleet";
import { ProvisionPanel } from "./DeviceProvision";
import { useDevices } from "./useDevices";

export function DevicesSection({ backend }: { backend: GsvBackend }) {
  const devices = useDevices(backend);
  const selected = devices.selectedDevice;
  const viewer = devices.state?.viewer ?? null;
  const [compactFleetOpen, setCompactFleetOpen] = useState(shouldStartInFleetView);
  const showFleetOnCompact = devices.mode === "detail" && (compactFleetOpen || (!devices.selectedDeviceId && !selected));

  useEffect(() => {
    const onPopState = () => setCompactFleetOpen(shouldStartInFleetView());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <section class={`gsv-devices${showFleetOnCompact ? " is-fleet-view" : " is-detail-view"}`}>
      <DeviceFleetPane
        state={devices.state}
        visibleDevices={devices.visibleDevices}
        selectedDeviceId={devices.selectedDeviceId}
        query={devices.query}
        scope={devices.scope}
        errorText={devices.errorText}
        onAdd={() => {
          devices.setIssuedToken(null);
          setCompactFleetOpen(false);
          devices.writeRoute({ mode: "provision" });
        }}
        onQuery={devices.setQuery}
        onScope={devices.setScope}
        onSelect={(deviceId) => {
          devices.setIssuedToken(null);
          setCompactFleetOpen(false);
          devices.writeRoute({ mode: "detail", deviceId });
        }}
      />

      {devices.mode === "provision" ? (
        <ProvisionPanel
          initialDeviceId={devices.selectedDeviceId ?? ""}
          viewer={viewer}
          pendingAction={devices.pendingAction}
          issuedToken={devices.issuedToken}
          onBack={() => {
            setCompactFleetOpen(true);
            devices.writeRoute({ mode: "detail" });
          }}
          onSubmit={(form) => void devices.createToken(form)}
        />
      ) : (
        <DeviceDetailPanel
          device={selected}
          viewer={viewer}
          activeTab={devices.activeTab}
          tokens={devices.state?.deviceTokens ?? []}
          pendingAction={devices.pendingAction}
          onTab={(tab) => devices.writeRoute({ tab })}
          onBackToFleet={() => setCompactFleetOpen(true)}
          onProvision={(deviceId) => {
            devices.setIssuedToken(null);
            setCompactFleetOpen(false);
            devices.writeRoute({ mode: "provision", deviceId });
          }}
          onRevoke={(tokenId) => void devices.revokeToken(tokenId)}
          onUpdateDescription={(deviceId, description) => void devices.updateDescription(deviceId, description)}
        />
      )}
    </section>
  );
}

function shouldStartInFleetView(): boolean {
  const url = new URL(window.location.href);
  return url.searchParams.get("mode") !== "provision" && !url.searchParams.get("device");
}
