import { Menu } from "lucide-react";
import type { ReactNode } from "react";
import { useUIStore } from "@/stores/ui";

interface Props {
  title: ReactNode;
  right?: ReactNode;
}

export function PageHeader({ title, right }: Props) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  return (
    <header className="page-header">
      {!sidebarOpen && (
        <button
          type="button"
          className="page-header-hamburger"
          onClick={toggleSidebar}
          aria-label="Open sidebar"
        >
          <Menu size={16} />
        </button>
      )}
      <h1 className="page-header-title">{title}</h1>
      {right && <div className="page-header-right">{right}</div>}
    </header>
  );
}
