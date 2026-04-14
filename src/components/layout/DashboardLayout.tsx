import { Outlet } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { ModalRoot } from "@/components/modals/ModalRoot";
import { useUIStore } from "@/stores/ui";
import { useResponsive } from "@/hooks/useResponsive";

export function DashboardLayout() {
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
    </div>
  );
}
