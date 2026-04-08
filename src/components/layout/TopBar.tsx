import { useState, useCallback } from "react";
import { Sun, Moon, Search, RefreshCw, Trash2, Loader2, XCircle } from "lucide-react";
import { useAuth } from "react-oidc-context";
import { useGraphStore } from "@/stores/graph";
import { useThemeStore } from "@/stores/theme";
import { useSync } from "@/hooks/useSync";

const SCHEDULE_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "5m", value: 5 },
  { label: "15m", value: 15 },
  { label: "30m", value: 30 },
  { label: "1h", value: 60 },
  { label: "6h", value: 360 },
  { label: "24h", value: 1440 },
];

export function TopBar() {
  const auth = useAuth();
  const { connectionStatus, stats, searchQuery, setSearchQuery, syncStatus, clearCanvas } = useGraphStore();
  const { theme, toggleTheme } = useThemeStore();
  const { triggerSync, isSyncing, schedules, setSchedule, purgeGraph } = useSync();
  const profile = auth.user?.profile;
  const username = (profile?.preferred_username as string) || "U";
  const roles = ((profile?.realm_access as Record<string, string[]>)?.roles || []) as string[];
  const displayRole = roles.includes("admin") ? "admin" : roles.includes("engineer") ? "engineer" : "viewer";

  const [repoUrl, setRepoUrl] = useState("");
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);

  const currentSchedule = schedules.length > 0 ? schedules[0].interval_minutes : 0;
  const graphLoaded = stats.nodeCount > 0;
  const syncing = isSyncing || syncStatus === "syncing";

  const handleSync = useCallback(() => {
    if (!repoUrl.trim()) return;
    triggerSync(repoUrl.trim());
  }, [repoUrl, triggerSync]);

  const handleScheduleChange = useCallback(
    (value: number) => {
      if (!repoUrl.trim()) return;
      if (value === 0) return;
      setSchedule(repoUrl.trim(), value);
    },
    [repoUrl, setSchedule]
  );

  const handlePurge = useCallback(() => {
    purgeGraph();
    setShowPurgeConfirm(false);
    clearCanvas();
  }, [purgeGraph, clearCanvas]);

  return (
    <div
      className="flex items-center px-3 gap-2"
      style={{
        height: 44,
        minHeight: 44,
        borderBottom: "1px solid var(--border)",
        background: "rgba(255,255,255,0.015)",
      }}
    >
      {/* Repo URL input */}
      <input
        type="text"
        placeholder="https://github.com/owner/repo"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSync()}
        className="text-[11px] px-2 py-1 rounded-md outline-none"
        style={{
          width: 240,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "var(--text-primary)",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      />

      {/* Sync button */}
      <button
        onClick={handleSync}
        disabled={!repoUrl.trim() || syncing}
        title="Sync repository"
        className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
        style={{
          background: syncing ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.08)",
          border: "1px solid rgba(99,102,241,0.2)",
          opacity: !repoUrl.trim() || syncing ? 0.4 : 1,
        }}
      >
        {syncing ? (
          <Loader2 size={13} className="animate-spin" style={{ color: "#a5b4fc" }} />
        ) : (
          <RefreshCw size={13} style={{ color: "#a5b4fc" }} />
        )}
      </button>

      {/* Schedule dropdown */}
      <select
        value={currentSchedule}
        onChange={(e) => handleScheduleChange(Number(e.target.value))}
        disabled={!repoUrl.trim()}
        className="text-[10px] px-1.5 py-1 rounded-md outline-none cursor-pointer"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "var(--text-secondary)",
          fontFamily: "'JetBrains Mono', monospace",
          opacity: !repoUrl.trim() ? 0.4 : 1,
        }}
        title="Sync schedule"
      >
        {SCHEDULE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ background: "#0d0d12" }}>
            {opt.value === 0 ? "Schedule" : opt.label}
          </option>
        ))}
      </select>

      {/* Divider */}
      <div className="w-px h-4" style={{ background: "var(--border)" }} />

      {/* Search bar */}
      <div className="flex-1 flex items-center gap-1.5">
        <Search size={12} style={{ color: "var(--text-muted)" }} />
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={!graphLoaded}
          className="text-[11px] bg-transparent outline-none flex-1"
          style={{
            color: "var(--text-primary)",
            fontFamily: "'JetBrains Mono', monospace",
            opacity: graphLoaded ? 1 : 0.3,
          }}
        />
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        {/* Connection + stats */}
        <div className="flex items-center gap-1.5 text-[10px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <div
            className="w-[5px] h-[5px] rounded-full"
            style={{
              background: connectionStatus === "connected" ? "#10b981" : connectionStatus === "reconnecting" ? "#f59e0b" : "#ef4444",
              boxShadow: connectionStatus === "connected" ? "0 0 6px #10b981" : "none",
            }}
          />
          <span style={{ color: connectionStatus === "connected" ? "#6ee7b7" : connectionStatus === "reconnecting" ? "#fcd34d" : "#fca5a5" }}>
            {connectionStatus === "connected" ? "Live" : connectionStatus === "reconnecting" ? "..." : "Off"}
          </span>
        </div>

        <span className="text-[10px]" style={{ color: "var(--text-secondary)", fontFamily: "'JetBrains Mono', monospace" }}>
          <span style={{ color: "#a5b4fc" }}>{stats.nodeCount}</span> n
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-secondary)", fontFamily: "'JetBrains Mono', monospace" }}>
          <span style={{ color: "#a5b4fc" }}>{stats.edgeCount}</span> e
        </span>

        {stats.violationCount > 0 && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", fontFamily: "'JetBrains Mono', monospace" }}>
            <span style={{ color: "rgb(239,68,68)", fontSize: 11 }}>&#x2298;</span>
            <span style={{ color: "#fca5a5" }}>{stats.violationCount}</span>
          </div>
        )}

        <div className="w-px h-4" style={{ background: "var(--border)" }} />

        {/* Clear canvas */}
        <button
          onClick={clearCanvas}
          title="Clear canvas"
          className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <XCircle size={13} style={{ color: "var(--text-muted)" }} />
        </button>

        {/* Purge graph */}
        <div className="relative">
          <button
            onClick={() => setShowPurgeConfirm(!showPurgeConfirm)}
            title="Purge all graph data"
            className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)" }}
          >
            <Trash2 size={13} style={{ color: "#ef4444" }} />
          </button>
          {showPurgeConfirm && (
            <div
              className="absolute top-9 right-0 p-3 rounded-lg z-50 flex flex-col gap-2"
              style={{ background: "var(--bg-surface)", border: "1px solid rgba(239,68,68,0.2)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)", width: 220 }}
            >
              <span className="text-[11px] font-medium" style={{ color: "#fca5a5" }}>
                Permanently delete all graph data?
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handlePurge}
                  className="flex-1 text-[10px] py-1.5 rounded-md font-medium"
                  style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
                >
                  Purge
                </button>
                <button
                  onClick={() => setShowPurgeConfirm(false)}
                  className="flex-1 text-[10px] py-1.5 rounded-md"
                  style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun size={13} style={{ color: "var(--text-secondary)" }} /> : <Moon size={13} style={{ color: "var(--text-secondary)" }} />}
        </button>

        {/* User */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}>
            <span style={{ fontSize: 9, color: "#a5b4fc", fontWeight: 600 }}>{username.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-medium leading-none" style={{ color: "var(--text-primary)" }}>{username}</span>
            <span className="text-[8px] leading-none mt-0.5" style={{ color: "var(--text-muted)" }}>{displayRole}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
