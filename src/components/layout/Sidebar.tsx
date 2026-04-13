import { useState } from "react";
import {
  GitBranch, Plug, Sparkles, Search, Shield,
  FileText, Activity, Terminal, Settings,
} from "lucide-react";
import { useAuth } from "react-oidc-context";
import { useUIStore, type ModalName } from "@/stores/ui";
import { cn } from "@/lib/utils";

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
    <nav className="flex flex-col items-center py-2 gap-1 shrink-0 w-14 bg-background border-r border-border">
      {items.map((it) => {
        const isActive = it.active;
        const isHov = hov === it.label;
        const coming = it.modal !== "navigate" && !IMPLEMENTED.has(it.modal as string);

        return (
          <div
            key={it.label}
            className="relative flex items-center"
            onMouseEnter={() => setHov(it.label)}
            onMouseLeave={() => setHov(null)}
          >
            <div
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r bg-primary transition-all",
                isActive ? "h-4" : isHov ? "h-2" : "h-0"
              )}
            />
            <button
              onClick={() => it.modal !== "navigate" && open(it.modal)}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-md transition-colors",
                isActive && "bg-primary/10",
                !isActive && isHov && "bg-muted"
              )}
            >
              <it.icon
                size={16}
                strokeWidth={isActive ? 2 : 1.5}
                className={cn(
                  isActive ? "text-primary" : isHov ? "text-foreground" : "text-muted-foreground"
                )}
              />
            </button>

            {isHov && (
              <div className="absolute left-10 top-1/2 -translate-y-1/2 pointer-events-none z-50 animate-[fadeIn_0.1s_ease]">
                <div className="bg-popover border border-border rounded-md px-2 py-1 shadow-md whitespace-nowrap flex items-center gap-2">
                  <span className="text-xs font-medium">{it.label}</span>
                  {coming && (
                    <span className="text-[10px] font-bold uppercase text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                      soon
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex-1" />

      <div
        className="relative flex items-center"
        onMouseEnter={() => setHov("__u")}
        onMouseLeave={() => setHov(null)}
      >
        <button
          onClick={() => open("user")}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 border border-primary/20 transition-colors"
        >
          <span className="text-xs font-semibold text-primary">{initial}</span>
        </button>
        {hov === "__u" && (
          <div className="absolute left-10 top-1/2 -translate-y-1/2 pointer-events-none z-50 animate-[fadeIn_0.1s_ease]">
            <div className="bg-popover border border-border rounded-md px-2 py-1 shadow-md">
              <span className="text-xs font-medium">Account</span>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
