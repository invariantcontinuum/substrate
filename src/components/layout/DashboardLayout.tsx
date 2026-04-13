import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileNav } from "./MobileNav";
import { ModalRoot } from "@/components/modals/ModalRoot";
import { useResponsive } from "@/hooks/useResponsive";

export function DashboardLayout() {
  const { isDesktop } = useResponsive();

  return (
    <div>
      {isDesktop && <Sidebar />}

      <div>
        <TopBar />
        <main>
          <Outlet />
        </main>
      </div>

      {!isDesktop && <MobileNav />}
      <ModalRoot />
    </div>
  );
}
