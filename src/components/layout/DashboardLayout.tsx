import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileNav } from "./MobileNav";
import { ModalRoot } from "@/components/modals/ModalRoot";
import { useResponsive } from "@/hooks/useResponsive";

export function DashboardLayout() {
  const { isDesktop } = useResponsive();

  return (
    <div className="flex flex-col h-screen bg-white">
      <TopBar />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {isDesktop && <Sidebar />}
        <main className="flex-1 min-w-0 overflow-hidden">
          <Outlet />
        </main>
      </div>

      {!isDesktop && <MobileNav />}
      <ModalRoot />
    </div>
  );
}
