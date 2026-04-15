import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useAuth } from "react-oidc-context";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
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
  useEffect(() => {
    if (!token) return;
    const { hasInitialized, initializeIfNeeded, pruneInvalid } = useSyncSetStore.getState();
    if (!hasInitialized) {
      void initializeIfNeeded(token);
    } else {
      void apiFetch<{items: {id: string}[]}>(`/api/syncs?status=completed&limit=100`, token)
        .then(({items}) => pruneInvalid(new Set(items.map((r) => r.id))))
        .catch(() => { /* ignore */ });
    }
  }, [token]);

  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
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
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <ModalRoot />
      <SwapToast />
    </div>
  );
}
