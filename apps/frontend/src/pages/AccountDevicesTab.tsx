import { useAuth } from "react-oidc-context";
import { useQueryClient } from "@tanstack/react-query";
import { SectionHeader } from "@/components/common/SectionHeader";
import { DeviceRow, type DeviceShape } from "@/components/account/DeviceRow";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSyncSetStore } from "@/stores/syncSet";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";

export function AccountDevicesTab() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const currentDeviceId = useSyncSetStore((s) => s.deviceId);
  const { me, meQuery, upsertDevice } = useCurrentUser();
  const qc = useQueryClient();

  if (meQuery.isLoading || !me) {
    return <div className="muted">Loading devices…</div>;
  }
  const devices: DeviceShape[] = me.devices ?? [];
  if (devices.length === 0) {
    return <div className="muted">No devices registered yet.</div>;
  }

  const rename = async (deviceId: string, name: string) => {
    const device = devices.find((d) => d.device_id === deviceId);
    if (!device || !token) return;
    await upsertDevice({
      deviceId,
      label: name,
      last_loaded_sync_ids: device.last_loaded_sync_ids ?? [],
    });
  };

  const forget = async (deviceId: string) => {
    if (!token) return;
    try {
      await apiFetch(
        `/api/users/me/devices/${encodeURIComponent(deviceId)}`,
        token,
        { method: "DELETE" },
      );
      await qc.invalidateQueries({ queryKey: ["users", "me"] });
    } catch (err) {
      logger.warn("forget_device_failed", { deviceId, error: String(err) });
    }
  };

  return (
    <>
      <SectionHeader
        title="Devices on this account"
        aux={`${devices.length} active`}
      />
      {devices.map((d) => (
        <DeviceRow
          key={d.device_id}
          device={d}
          isCurrent={d.device_id === currentDeviceId}
          onRename={(n) => rename(d.device_id, n)}
          onForget={() => forget(d.device_id)}
        />
      ))}
    </>
  );
}
