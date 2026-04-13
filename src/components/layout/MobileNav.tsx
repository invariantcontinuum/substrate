import {
  GitBranch, Plug, Sparkles, Search, Shield,
  FileText, Activity, Terminal, Settings, X, Brain,
} from "lucide-react";
import { useAuth } from "react-oidc-context";
import { useUIStore, type ModalName } from "@/stores/ui";

const items: { icon: typeof GitBranch; label: string; modal: ModalName | "navigate" }[] = [
  { icon: GitBranch, label: "Graph",      modal: "navigate" },
  { icon: Plug,      label: "Sources",    modal: "sources" },
  { icon: Sparkles,  label: "Enrichment", modal: "enrichment" },
  { icon: Search,    label: "Search",     modal: "search" },
  { icon: Shield,    label: "Policies",   modal: "policies" },
  { icon: FileText,  label: "ADRs",       modal: "adrs" },
  { icon: Activity,  label: "Drift",      modal: "drift" },
  { icon: Terminal,  label: "Query",      modal: "query" },
];

export function MobileNav() {
  const { sidebarOpen, setSidebarOpen, openModal } = useUIStore();
  const auth = useAuth();
  const initial = auth.user?.profile?.name?.[0]?.toUpperCase() ?? "U";

  const go = (modal: ModalName | "navigate") => {
    setSidebarOpen(false);
    if (modal !== "navigate") openModal(modal);
  };

  if (!sidebarOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="w-64 border-r border-black bg-white flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-black">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-black" />
            <span className="text-black">Substrate</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="border border-black p-1">
            <X size={16} className="text-black" />
          </button>
        </div>

        <div className="flex flex-col">
          {items.map((it) => (
            <button key={it.label} onClick={() => go(it.modal)} className="text-left p-3 border-b border-black text-black flex items-center gap-2">
              <it.icon size={17} />
              {it.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />
        <div className="p-4 border-t border-black flex items-center gap-2">
          <button onClick={() => go("user")} className="border border-black p-2 text-black">{initial}</button>
          <div className="flex-1" />
          <button onClick={() => go("settings")} className="border border-black p-2">
            <Settings size={16} className="text-black" />
          </button>
        </div>
      </div>
    </div>
  );
}
