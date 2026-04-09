import { useState } from "react";
import { GitBranch, Plug, Sparkles, Search, Shield, FileText, Activity, Terminal, Settings } from "lucide-react";
import { useUIStore, type ModalName } from "@/stores/ui";
import { useGraphStore } from "@/stores/graph";

/* ── Which modals are fully implemented ── */
const IMPLEMENTED_MODALS = new Set<string>(["sources", "enrichment", "search", "settings", "user"]);

interface NavItem {
  icon: typeof GitBranch;
  label: string;
  modal: ModalName | "navigate";
  active?: boolean;
}

const menuItems: NavItem[] = [
  { icon: GitBranch, label: "Graph", modal: "navigate", active: true },
  { icon: Plug, label: "Sources", modal: "sources" },
  { icon: Sparkles, label: "Enrichment", modal: "enrichment" },
  { icon: Search, label: "Search", modal: "search" },
  { icon: Shield, label: "Policies", modal: "policies" },
  { icon: FileText, label: "ADRs", modal: "adrs" },
  { icon: Activity, label: "Drift", modal: "drift" },
  { icon: Terminal, label: "Query", modal: "query" },
  { icon: Settings, label: "Settings", modal: "settings" },
];

const nodeTypes = [
  { type: "service", label: "Svc", color: "#3b4199" },
  { type: "database", label: "DB", color: "#065f46" },
  { type: "cache", label: "Ca", color: "#047857" },
  { type: "external", label: "Ext", color: "#374151" },
];

const layouts: { value: "force" | "hierarchical"; icon: string }[] = [
  { value: "force", icon: "F" },
  { value: "hierarchical", icon: "H" },
];

/* ── Shared button size for all nav items ── */
const NAV_ITEM_SIZE = 38;

function NavButton({ item, hovered, onHover, onLeave, onClick }: {
  item: NavItem;
  hovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const isActive = item.active;
  const isComingSoon = item.modal !== "navigate" && !IMPLEMENTED_MODALS.has(item.modal as string);

  return (
    <div className="relative flex items-center" onMouseEnter={onHover} onMouseLeave={onLeave}>
      {/* Active indicator bar */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: "50%",
          transform: "translateY(-50%)",
          width: 3,
          height: isActive ? 20 : hovered ? 14 : 0,
          borderRadius: "0 2px 2px 0",
          background: "var(--accent)",
          transition: "height 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: isActive || hovered ? "0 0 8px var(--accent-glow)" : "none",
        }}
      />

      <button
        onClick={onClick}
        className="flex items-center justify-center"
        style={{
          width: NAV_ITEM_SIZE,
          height: NAV_ITEM_SIZE,
          borderRadius: "var(--radius-md)",
          background: isActive
            ? "var(--accent-soft)"
            : hovered
              ? "var(--bg-hover)"
              : "transparent",
          border: isActive
            ? "1px solid var(--accent-medium)"
            : "1px solid transparent",
          cursor: "pointer",
          transition: "all 0.15s ease-out",
          transform: hovered && !isActive ? "scale(1.06)" : "scale(1)",
        }}
      >
        <item.icon
          size={16}
          color={
            isActive
              ? "var(--accent-text)"
              : hovered
                ? "var(--text-secondary)"
                : "var(--text-muted)"
          }
          strokeWidth={isActive ? 2 : 1.5}
          style={{ transition: "color 0.15s ease-out" }}
        />
      </button>

      {/* Hover label tooltip */}
      <div
        style={{
          position: "absolute",
          left: NAV_ITEM_SIZE + 6,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.12s ease-out, transform 0.12s ease-out",
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "4px 8px",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--text-primary)",
              fontFamily: "var(--font-sans)",
              letterSpacing: "0.01em",
            }}
          >
            {item.label}
          </span>
          {isComingSoon && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: "var(--warning-text)",
                background: "var(--warning-soft)",
                padding: "1px 5px",
                borderRadius: 3,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              soon
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { openModal } = useUIStore();
  const { filters, toggleTypeFilter, layout, setLayout } = useGraphStore();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const handleNavClick = (item: NavItem) => {
    if (item.modal === "navigate") return;
    openModal(item.modal);
  };

  return (
    <div
      className="flex flex-col items-center py-2.5 gap-0.5 shrink-0"
      style={{
        width: "var(--sidebar-width)",
        minWidth: "var(--sidebar-width)",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-center mb-2"
        style={{
          width: 30, height: 30, borderRadius: "var(--radius-md)",
          background: "var(--accent-soft)",
          border: "1px solid var(--accent-medium)",
        }}
      >
        <span style={{ color: "var(--accent)", fontSize: 13, fontWeight: 800 }}>S</span>
      </div>

      {/* Nav items — all equally sized, all clickable */}
      {menuItems.map((item) => (
        <NavButton
          key={item.label}
          item={item}
          hovered={hoveredItem === item.label}
          onHover={() => setHoveredItem(item.label)}
          onLeave={() => setHoveredItem(null)}
          onClick={() => handleNavClick(item)}
        />
      ))}

      {/* Separator */}
      <div className="w-5 my-1" style={{ borderTop: "1px solid var(--border)" }} />

      {/* Node type filters */}
      <div className="flex flex-col items-center gap-0.5">
        {nodeTypes.map((nt) => {
          const active = filters.types.has(nt.type);
          return (
            <button
              key={nt.type}
              title={`Toggle ${nt.type}`}
              onClick={() => toggleTypeFilter(nt.type)}
              className="flex items-center justify-center"
              style={{
                width: 28, height: 20, borderRadius: "var(--radius-sm)",
                border: `1.5px solid ${active ? nt.color : "var(--border)"}`,
                opacity: active ? 1 : 0.3,
                transition: "all 0.15s ease-out",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 8, color: active ? nt.color : "var(--text-muted)", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                {nt.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Layout switcher */}
      <div className="flex flex-col items-center gap-0.5 mt-1">
        {layouts.map((l) => (
          <button
            key={l.value}
            title={l.value}
            onClick={() => setLayout(l.value)}
            className="flex items-center justify-center"
            style={{
              width: 22, height: 18, borderRadius: "var(--radius-sm)",
              background: layout === l.value ? "var(--accent-soft)" : "transparent",
              border: layout === l.value ? "1px solid var(--accent-medium)" : "1px solid transparent",
              transition: "all 0.15s ease-out",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 8, color: layout === l.value ? "var(--accent-text)" : "var(--text-muted)", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
              {l.icon}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Avatar */}
      <div
        className="relative flex items-center"
        onMouseEnter={() => setHoveredItem("__account")}
        onMouseLeave={() => setHoveredItem(null)}
      >
        <button
          onClick={() => openModal("user")}
          className="flex items-center justify-center"
          style={{
            width: NAV_ITEM_SIZE,
            height: NAV_ITEM_SIZE,
            borderRadius: "50%",
            background: hoveredItem === "__account" ? "var(--accent-medium)" : "var(--accent-soft)",
            border: "1px solid var(--accent-medium)",
            cursor: "pointer",
            transition: "all 0.15s ease-out",
            transform: hoveredItem === "__account" ? "scale(1.08)" : "scale(1)",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--accent-text)", fontWeight: 600 }}>U</span>
        </button>

        {/* Account tooltip */}
        <div
          style={{
            position: "absolute",
            left: NAV_ITEM_SIZE + 6,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            opacity: hoveredItem === "__account" ? 1 : 0,
            transition: "opacity 0.12s ease-out",
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "4px 8px",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
              Account
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
