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
    <nav>
      {items.map((it) => {
        const isActive = it.active;
        const isHov = hov === it.label;
        const coming = it.modal !== "navigate" && !IMPLEMENTED.has(it.modal as string);

        return (
          <div
            key={it.label}
            onMouseEnter={() => setHov(it.label)}
            onMouseLeave={() => setHov(null)}
          >
            <div />
            <button onClick={() => it.modal !== "navigate" && open(it.modal)}>
              <it.icon size={16} strokeWidth={isActive ? 2 : 1.5} />
            </button>

            {isHov && (
              <div>
                <div>
                  <span>{it.label}</span>
                  {coming && <span>soon</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div />

      <div onMouseEnter={() => setHov("__u")} onMouseLeave={() => setHov(null)}>
        <button onClick={() => open("user")}>
          <span>{initial}</span>
        </button>
        {hov === "__u" && (
          <div>
            <div>
              <span>Account</span>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
