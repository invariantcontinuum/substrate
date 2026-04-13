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

const SZ = 34;

export function Sidebar() {
  const open = useUIStore((s) => s.openModal);
  const auth = useAuth();
  const initial = auth.user?.profile?.name?.[0]?.toUpperCase() ?? "U";
  const [hov, setHov] = useState<string | null>(null);

  return (
    <nav
      className="flex flex-col items-center py-2 gap-0.5 shrink-0"
      style={{
        width: "var(--sidebar-width)",
        minWidth: "var(--sidebar-width)",
        background: "var(--bg-surface)",
        backdropFilter: "blur(var(--overlay-blur))",
        WebkitBackdropFilter: "blur(var(--overlay-blur))",
        borderRight: "1px solid var(--border)",
      }}
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
              style={{
                position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                width: 2, borderRadius: "0 3px 3px 0",
                height: isActive ? 18 : isHov ? 12 : 0,
                background: "var(--accent)",
                transition: "height 0.2s ease-out",
                boxShadow: isActive || isHov ? "0 0 8px var(--accent-glow)" : "none",
              }}
            />
            <button
              onClick={() => it.modal !== "navigate" && open(it.modal)}
              style={{
                width: SZ, height: SZ, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "var(--radius-md)",
                background: isActive ? "var(--accent-soft)" : isHov ? "var(--bg-hover)" : "transparent",
                outline: isActive ? "1px solid var(--accent-medium)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <it.icon
                size={15}
                strokeWidth={isActive ? 2 : 1.5}
                color={isActive ? "var(--accent)" : isHov ? "var(--text-primary)" : "var(--text-muted)"}
              />
            </button>

            {/* Tooltip */}
            {isHov && (
              <div
                style={{
                  position: "absolute", left: SZ + 8, top: "50%", transform: "translateY(-50%)",
                  pointerEvents: "none", zIndex: 100, display: "flex", alignItems: "center", gap: 5,
                  animation: "fadeIn 0.1s ease",
                }}
              >
                <div
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)", padding: "3px 8px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.4)", whiteSpace: "nowrap",
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)" }}>
                    {it.label}
                  </span>
                  {coming && (
                    <span
                      style={{
                        fontSize: 8, fontWeight: 700, textTransform: "uppercase",
                        color: "var(--warning-text)", background: "var(--warning-soft)",
                        padding: "2px 5px", borderRadius: 6, letterSpacing: "0.04em",
                        fontFamily: "var(--font-mono)",
                      }}
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
          style={{
            width: SZ, height: SZ, borderRadius: "50%",
            background: "var(--accent-soft)",
            outline: "1px solid var(--accent-medium)",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s ease",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--accent-text)", fontWeight: 600 }}>{initial}</span>
        </button>
        {hov === "__u" && (
          <div
            style={{
              position: "absolute", left: SZ + 8, top: "50%", transform: "translateY(-50%)",
              pointerEvents: "none", zIndex: 100, animation: "fadeIn 0.1s ease",
            }}
          >
            <div style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", padding: "3px 8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)" }}>Account</span>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
