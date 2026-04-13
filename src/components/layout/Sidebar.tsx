import { useState } from "react";
import {
  GitBranch, Plug, Sparkles, Search, Shield,
  FileText, Activity, Terminal, Settings,
} from "lucide-react";
import { useAuth } from "react-oidc-context";
import { useUIStore, type ModalName } from "@/stores/ui";

const IMPLEMENTED = new Set(["sources", "enrichment", "search", "settings", "user"]);

interface NavItem {
  icon: typeof GitBranch;
  label: string;
  modal: ModalName | "navigate";
  active?: boolean;
}

const items: NavItem[] = [
  { icon: GitBranch, label: "Graph",      modal: "navigate", active: true },
  { icon: Plug,      label: "Sources",    modal: "sources" },
  { icon: Sparkles,  label: "Enrichment", modal: "enrichment" },
  { icon: Search,    label: "Search",     modal: "search" },
  { icon: Shield,    label: "Policies",   modal: "policies" },
  { icon: FileText,  label: "ADRs",       modal: "adrs" },
  { icon: Activity,  label: "Drift",      modal: "drift" },
  { icon: Terminal,  label: "Query",      modal: "query" },
  { icon: Settings,  label: "Settings",   modal: "settings" },
];

export function Sidebar() {
  const open = useUIStore((s) => s.openModal);
  const auth = useAuth();
  const initial = auth.user?.profile?.name?.[0]?.toUpperCase() ?? "U";
  const [hov, setHov] = useState<string | null>(null);

  return (
    <nav className="flex flex-col w-48 border-r border-black bg-white h-full">
      {items.map((it) => {
        const coming = it.modal !== "navigate" && !IMPLEMENTED.has(it.modal as string);

        return (
          <div
            key={it.label}
            onMouseEnter={() => setHov(it.label)}
            onMouseLeave={() => setHov(null)}
            className="relative"
          >
            <button
              onClick={() => it.modal !== "navigate" && open(it.modal)}
              className="w-full flex items-center gap-2 p-3 border-b border-black text-black text-left"
            >
              <it.icon size={16} />
              <span>{it.label}</span>
              {coming && <span className="ml-auto border border-black px-1">soon</span>}
            </button>

            {hov === it.label && (
              <div className="absolute left-full top-0 z-50 bg-white border border-black p-2 whitespace-nowrap">
                {it.label}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex-1" />

      <div className="relative" onMouseEnter={() => setHov("__u")} onMouseLeave={() => setHov(null)}>
        <button onClick={() => open("user")} className="w-full p-3 border-t border-black text-black text-left">
          {initial}
        </button>
        {hov === "__u" && (
          <div className="absolute left-full bottom-0 z-50 bg-white border border-black p-2 whitespace-nowrap">
            Account
          </div>
        )}
      </div>
    </nav>
  );
}
