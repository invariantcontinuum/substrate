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

const SZ = 42;

export function Sidebar() {
  const open = useUIStore((s) => s.openModal);
  const auth = useAuth();
  const initial = auth.user?.profile?.name?.[0]?.toUpperCase() ?? "U";
  const [hov, setHov] = useState<string | null>(null);

  return (
    <nav
      className="flex flex-col items-center py-5 px-2 gap-1.5 shrink-0"
      style={{
        width: "var(--sidebar-width)",
        minWidth: "var(--sidebar-width)",
        background: "var(--bg-surface)",
        boxShadow: "var(--neu-extruded-sm)",
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
                width: 3, borderRadius: "0 3px 3px 0",
                height: isActive ? 22 : isHov ? 16 : 0,
                background: "var(--accent)",
                transition: "height 0.2s ease-out",
                boxShadow: isActive || isHov ? "0 0 8px var(--accent-glow)" : "none",
              }}
            />
            <button
              onClick={() => it.modal !== "navigate" && open(it.modal)}
              className={isActive ? "neu-inset-sm" : isHov ? "neu-extruded-sm" : ""}
              style={{
                width: SZ, height: SZ, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "var(--radius-md)",
                background: isActive ? "var(--bg-surface)" : "var(--bg-surface)",
                boxShadow: isActive ? "var(--neu-inset-sm)" : isHov ? "var(--neu-extruded-sm)" : "none",
                transition: "all 0.3s ease-out",
              }}
            >
              <it.icon
                size={17}
                strokeWidth={isActive ? 2.2 : 1.6}
                color={isActive ? "var(--accent)" : isHov ? "var(--text-primary)" : "var(--text-muted)"}
              />
            </button>

            {/* Tooltip */}
            {isHov && (
              <div
                style={{
                  position: "absolute", left: SZ + 12, top: "50%", transform: "translateY(-50%)",
                  pointerEvents: "none", zIndex: 100, display: "flex", alignItems: "center", gap: 6,
                  animation: "fadeIn 0.12s ease",
                }}
              >
                <div
                  style={{
                    background: "var(--bg-surface)",
                    borderRadius: "var(--radius-md)", padding: "6px 12px",
                    boxShadow: "var(--neu-extruded-sm)", whiteSpace: "nowrap",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
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
        className="relative flex items-center mb-1"
        onMouseEnter={() => setHov("__u")}
        onMouseLeave={() => setHov(null)}
      >
        <button
          onClick={() => open("user")}
          style={{
            width: SZ, height: SZ, borderRadius: "50%",
            background: hov === "__u" ? "var(--accent)" : "var(--bg-surface)",
            boxShadow: hov === "__u" ? "var(--neu-extruded)" : "var(--neu-extruded-sm)",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.3s ease-out",
          }}
        >
          <span style={{
            fontSize: 13,
            color: hov === "__u" ? "#fff" : "var(--accent)",
            fontWeight: 700,
            fontFamily: "var(--font-display)",
          }}>{initial}</span>
        </button>
        {hov === "__u" && (
          <div
            style={{
              position: "absolute", left: SZ + 12, top: "50%", transform: "translateY(-50%)",
              pointerEvents: "none", zIndex: 100, animation: "fadeIn 0.12s ease",
            }}
          >
            <div style={{
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-md)", padding: "6px 12px",
              boxShadow: "var(--neu-extruded-sm)",
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>Account</span>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
