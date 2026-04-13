import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileNav } from "./MobileNav";
import { ModalRoot } from "@/components/modals/ModalRoot";
import { useResponsive } from "@/hooks/useResponsive";

export function DashboardLayout() {
  const { isDesktop } = useResponsive();

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {isDesktop && <Sidebar />}

      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <main className="flex-1 min-h-0 overflow-hidden relative">
          <Outlet />
        </main>
      </div>

      {!isDesktop && <MobileNav />}
      <ModalRoot />
    </div>
  );
}
