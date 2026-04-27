import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { Sidebar } from "./Sidebar";
import { ModalRoot } from "@/components/modals/ModalRoot";
import { SwapToast } from "@/components/SwapToast";
import { useUIStore } from "@/stores/ui";
import { useResponsive } from "@/hooks/useResponsive";
import { useSyncs } from "@/hooks/useSyncs";
import { useSyncSetStore } from "@/stores/syncSet";
import { apiFetch } from "@/lib/api";

export function DashboardLayout() {
  // Keep the syncs polling alive for the whole session, not
  // just while a modal is open. Previously useJobs only mounted inside
  // SourcesModal / EnrichmentModal, so closing both modals stopped all
  // polling — the `running → completed` detector then couldn't fire a
  // fetchGraph after a background sync finished.
  useSyncs();

  const auth = useAuth();
  const token = auth.user?.access_token;
  const deviceId = useSyncSetStore((s) => s.deviceId);
  const syncIds = useSyncSetStore((s) => s.syncIds);
  const userSub = (
    (auth.user?.profile?.sub as string | undefined)
    ?? (auth.user?.profile?.preferred_username as string | undefined)
    ?? (auth.user?.profile?.email as string | undefined)
    ?? null
  );
  useEffect(() => {
    if (!token || !userSub) return;
    let cancelled = false;

    void (async () => {
      const { hydrateForUser, initializeIfNeeded, pruneInvalid } = useSyncSetStore.getState();
      // Rehydrate per-user, per-device loaded snapshot context first so one
      // browser can switch accounts without cross-user leakage.
      hydrateForUser(userSub);
      const hadPersistedIds = useSyncSetStore.getState().syncIds.length > 0;

      let validSyncIds = new Set<string>();
      try {
        // Validate persisted ids against the server so purged/cleaned snapshots
        // don't stay pinned in the active set forever.
        const { items } = await apiFetch<{ items: { id: string }[] }>(
          `/api/syncs?status=completed&limit=100`,
          token,
        );
        if (cancelled) return;
        validSyncIds = new Set(items.map((row) => row.id));
        pruneInvalid(validSyncIds);
      } catch {
        // Ignore bootstrap validation failures; fallback seeding below uses
        // source-owned last_sync_id values, which are already authoritative.
      }

      if (cancelled || useSyncSetStore.getState().syncIds.length > 0) return;

      try {
        const [userResp, sourceResp] = await Promise.all([
          apiFetch<{ devices: { device_id: string; last_loaded_sync_ids: string[] }[] }>(
            "/api/users/me",
            token,
          ),
          apiFetch<{ items: { last_sync_id: string | null }[] }>(
            "/api/sources?limit=100",
            token,
          ),
        ]);
        if (cancelled) return;

        const sourceSeedIds = sourceResp.items
          .map((source) => source.last_sync_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0);
        const allowedSeedIds = new Set([...validSyncIds, ...sourceSeedIds]);
        const deviceSeedIds =
          userResp.devices.find((device) => device.device_id === deviceId)?.last_loaded_sync_ids
            ?? [];
        const preferredSeedIds = deviceSeedIds.filter((id) => allowedSeedIds.has(id));
        const seedSyncIds = preferredSeedIds.length > 0
          ? preferredSeedIds
          : sourceSeedIds;

        await initializeIfNeeded(seedSyncIds, { force: hadPersistedIds });
      } catch {
        if (cancelled) return;
        await initializeIfNeeded([], { force: hadPersistedIds });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, userSub, deviceId]);

  useEffect(() => {
    if (!token || !userSub) return;
    void apiFetch(`/api/users/me/devices/${encodeURIComponent(deviceId)}`, token, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_loaded_sync_ids: syncIds }),
    }).catch(() => { /* ignore device-sync telemetry failures */ });
  }, [token, userSub, deviceId, syncIds]);

  const location = useLocation();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { isDesktop } = useResponsive();

  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith("/sources")) setActiveView("sources");
    else if (path.startsWith("/account")) setActiveView("account");
    else if (path.startsWith("/chat")) setActiveView("chat");
    else setActiveView("graph");
  }, [location.pathname, setActiveView]);

  return (
    <div className="dashboard">
      <div className="dashboard-body">
        <Sidebar />
        {!isDesktop && sidebarOpen && (
          <button
            type="button"
            className="dashboard-scrim"
            onClick={toggleSidebar}
            aria-label="Close sidebar"
          />
        )}
        <main
          className="dashboard-main"
          inert={!isDesktop && sidebarOpen ? true : undefined}
        >
          <Outlet />
        </main>
      </div>
      <ModalRoot />
      <SwapToast />
    </div>
  );
}
