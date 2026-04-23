import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useAuth } from "react-oidc-context";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { ModalRoot } from "@/components/modals/ModalRoot";
import { SwapToast } from "@/components/SwapToast";
import { SourcesSettings } from "@/components/sources/SourcesSettings";
import { AskPage } from "@/pages/AskPage";
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
    const { hydrateForUser, initializeIfNeeded, pruneInvalid } = useSyncSetStore.getState();
    // Rehydrate per-user, per-device loaded snapshot context first so one
    // browser can switch accounts without cross-user leakage.
    hydrateForUser(userSub);
    // 1. Always validate persisted ids against the server (catches purged/cleaned).
    void apiFetch<{items: {id: string}[]}>(`/api/syncs?status=completed&limit=100`, token)
      .then(({items}) => pruneInvalid(new Set(items.map((r) => r.id))))
      .catch(() => { /* ignore */ })
      // 2. After pruning, if the active set is empty, try to populate it from
      // sources.last_sync_id. initializeIfNeeded is a no-op when ids exist.
      .finally(() => {
        if (useSyncSetStore.getState().syncIds.length === 0) {
          void initializeIfNeeded();
        }
      });
  }, [token, userSub]);

  useEffect(() => {
    if (!token || !userSub) return;
    void apiFetch(`/api/users/me/devices/${encodeURIComponent(deviceId)}`, token, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_loaded_sync_ids: syncIds }),
    }).catch(() => { /* ignore device-sync telemetry failures */ });
  }, [token, userSub, deviceId, syncIds]);

  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const activeView = useUIStore((s) => s.activeView);
  const { isDesktop } = useResponsive();
  const showSidebar = isDesktop && sidebarOpen;
  const showReopenHandle = isDesktop && !sidebarOpen;

  return (
    <div className="dashboard">
      <TopBar />
      <div className="dashboard-body">
        {showSidebar && <Sidebar />}
        {showReopenHandle && (
          <button
            type="button"
            className="side-nav-reopen"
            onClick={() => setSidebarOpen(true)}
            title="Show sidebar"
            aria-label="Show sidebar"
          >
            <ChevronRight size={16} />
          </button>
        )}
        <main className="dashboard-main">
          <div className={`view-root${activeView === "graph" ? "" : " is-hidden"}`}>
            <Outlet />
          </div>
          <div className={`view-root${activeView === "sources" ? "" : " is-hidden"}`}>
            <SourcesSettings />
          </div>
          <div className={`view-root${activeView === "ask" ? "" : " is-hidden"}`}>
            <AskPage />
          </div>
        </main>
      </div>
      <MobileNav />
      <ModalRoot />
      <SwapToast />
    </div>
  );
}
