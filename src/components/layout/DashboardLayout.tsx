import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileNav } from "./MobileNav";
import { ModalRoot } from "@/components/modals/ModalRoot";
import { useResponsive } from "@/hooks/useResponsive";

export function DashboardLayout() {
  const { isDesktop } = useResponsive();

  return (
    <div className="flex h-screen" style={{ background: "var(--bg)" }}>
      {isDesktop && <Sidebar />}
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      {!isDesktop && <MobileNav />}
      <ModalRoot />
    </div>
  );
}
