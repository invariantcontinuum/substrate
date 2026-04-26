import { useAuth } from "react-oidc-context";
import { useQueryClient } from "@tanstack/react-query";
import { SectionHeader } from "@/components/common/SectionHeader";
import { DeviceRow, type DeviceShape } from "@/components/account/DeviceRow";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSyncSetStore } from "@/stores/syncSet";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";

/**
 * Settings · Devices tab.
 *
 * Renders the (scrollable) list of `user_devices` rows for the current
 * user. Each row supports inline rename and a confirmable forget action
 * — both backed by `PUT/DELETE /api/users/me/devices/{id}`. The display
 * label is whatever the backend persisted, which Phase 4.4 derives from
 * the User-Agent header (`parse_device_name`) on first PUT so users see
 * "Chrome 120 on Linux" instead of a raw device_id slug.
 */
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
      {devices.length === 0 ? (
        <div className="muted">No devices registered yet.</div>
      ) : (
        <div className="devices-list" role="list">
          {devices.map((d) => (
            <DeviceRow
              key={d.device_id}
              device={d}
              isCurrent={d.device_id === currentDeviceId}
              onRename={(n) => rename(d.device_id, n)}
              onForget={() => forget(d.device_id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
