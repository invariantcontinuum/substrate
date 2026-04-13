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
    <nav
      className="flex flex-col items-center pt-1.5 pb-2 gap-px shrink-0 w-13 min-w-13 bg-[var(--bg-glass)] backdrop-blur-md border-r border-[var(--border-glass)]"
    >
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
            {/* Active bar */}
            <div
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r-sm bg-[var(--accent-brand)] transition-all duration-200",
                isActive ? "h-[18px] shadow-[0_0_8px_var(--accent-glow)]" : isHov ? "h-3 shadow-[0_0_8px_var(--accent-glow)]" : "h-0"
              )}
            />
            <button
              onClick={() => it.modal !== "navigate" && open(it.modal)}
              className={cn(
                "flex items-center justify-center size-8 rounded-md transition-all duration-150 cursor-pointer",
                isActive && "bg-[var(--accent-soft)] outline outline-1 outline-[var(--accent-medium)]",
                !isActive && isHov && "bg-white/[0.04]",
              )}
            >
              <it.icon
                size={15}
                strokeWidth={isActive ? 2 : 1.5}
                className={cn(
                  isActive ? "text-[var(--accent-brand)]" : isHov ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                )}
              />
            </button>

            {/* Tooltip */}
            {isHov && (
              <div
                className="absolute left-[42px] top-1/2 -translate-y-1/2 pointer-events-none z-[100] flex items-center gap-1.5 animate-[fadeIn_0.1s_ease]"
              >
                <div
                  className="bg-[var(--color-popover)] border border-[var(--border-glass)] rounded-md px-2 py-0.5 shadow-lg whitespace-nowrap flex items-center gap-1.5"
                >
                  <span className="text-[11px] font-medium text-[var(--text-primary)]">
                    {it.label}
                  </span>
                  {coming && (
                    <span
                      className="text-[8px] font-bold uppercase text-[var(--warning-text)] bg-[var(--warning)]/10 px-1.5 py-0.5 rounded-md tracking-wide font-mono"
                    >
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

      {/* User avatar */}
      <div
        className="relative flex items-center"
        onMouseEnter={() => setHov("__u")}
        onMouseLeave={() => setHov(null)}
      >
        <button
          onClick={() => open("user")}
          className="flex items-center justify-center size-8 rounded-full bg-[var(--accent-soft)] outline outline-1 outline-[var(--accent-medium)] transition-all duration-150 cursor-pointer"
        >
          <span className="text-[11px] font-semibold text-[var(--accent-brand)]">{initial}</span>
        </button>
        {hov === "__u" && (
          <div
            className="absolute left-[42px] top-1/2 -translate-y-1/2 pointer-events-none z-[100] animate-[fadeIn_0.1s_ease]"
          >
            <div className="bg-[var(--color-popover)] border border-[var(--border-glass)] rounded-md px-2 py-0.5 shadow-lg">
              <span className="text-[11px] font-medium text-[var(--text-primary)]">Account</span>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
