import { Sun, Moon, Search } from "lucide-react";
import { useAuth } from "react-oidc-context";
import { useGraphStore } from "@/stores/graph";
import { useThemeStore } from "@/stores/theme";

export function TopBar() {
  const auth = useAuth();
  const { connectionStatus, stats } = useGraphStore();
  const { theme, toggleTheme } = useThemeStore();
  const profile = auth.user?.profile;
  const username = (profile?.preferred_username as string) || "U";
  const roles = ((profile?.realm_access as Record<string, string[]>)?.roles || []) as string[];
  const displayRole = roles.includes("admin") ? "admin" : roles.includes("engineer") ? "engineer" : "viewer";

  return (
    <div
      className="flex items-center px-4 gap-3"
      style={{
        height: 44,
        minHeight: 44,
        borderBottom: "1px solid var(--border)",
        background: "rgba(255,255,255,0.015)",
      }}
    >
      <div className="flex-1 flex items-center gap-2">
        <Search size={12} style={{ color: "var(--text-muted)" }} />
        <span className="text-[11px]" style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
          Search nodes...
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Connection status */}
        <div className="flex items-center gap-1.5 text-[10px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <div
            className="w-[5px] h-[5px] rounded-full"
            style={{
              background:
                connectionStatus === "connected" ? "#10b981"
                : connectionStatus === "reconnecting" ? "#f59e0b"
                : "#ef4444",
              boxShadow:
                connectionStatus === "connected" ? "0 0 6px #10b981" : "none",
            }}
          />
          <span style={{
            color: connectionStatus === "connected" ? "#6ee7b7"
              : connectionStatus === "reconnecting" ? "#fcd34d"
              : "#fca5a5",
          }}>
            {connectionStatus === "connected" ? "Live" : connectionStatus === "reconnecting" ? "Reconnecting" : "Offline"}
          </span>
        </div>

        {/* Stats */}
        <span className="text-[10px]" style={{ color: "var(--text-secondary)", fontFamily: "'JetBrains Mono', monospace" }}>
          <span style={{ color: "#a5b4fc" }}>{stats.nodeCount}</span>{" "}nodes
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-secondary)", fontFamily: "'JetBrains Mono', monospace" }}>
          <span style={{ color: "#a5b4fc" }}>{stats.edgeCount}</span>{" "}edges
        </span>

        {/* Violation badge */}
        {stats.violationCount > 0 && (
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px]"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.15)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <span style={{ color: "rgb(239,68,68)", fontSize: 12 }}>&#x2298;</span>
            <span style={{ color: "#fca5a5" }}>
              {stats.violationCount} violation{stats.violationCount > 1 ? "s" : ""} detected
            </span>
          </div>
        )}

        {/* Divider */}
        <div className="w-px h-4" style={{ background: "var(--border)" }} />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? (
            <Sun size={13} style={{ color: "var(--text-secondary)" }} />
          ) : (
            <Moon size={13} style={{ color: "var(--text-secondary)" }} />
          )}
        </button>

        {/* User context */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center"
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "rgba(99,102,241,0.2)",
              border: "1px solid rgba(99,102,241,0.3)",
            }}
          >
            <span style={{ fontSize: 10, color: "#a5b4fc", fontWeight: 600 }}>
              {username.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-medium leading-none" style={{ color: "var(--text-primary)" }}>
              {username}
            </span>
            <span className="text-[9px] leading-none mt-0.5" style={{ color: "var(--text-muted)" }}>
              {displayRole}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
