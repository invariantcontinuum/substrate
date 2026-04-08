import { Search } from "lucide-react";
import { useAuth } from "react-oidc-context";
import { useGraphStore } from "@/stores/graph";

export function TopBar() {
  const auth = useAuth();
  const { connectionStatus, stats } = useGraphStore();
  const username = auth.user?.profile?.preferred_username || "U";

  return (
    <div
      className="flex items-center px-4 gap-3"
      style={{
        height: 48,
        minHeight: 48,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.015)",
      }}
    >
      {/* Search */}
      <div className="flex-1 flex items-center gap-2">
        <Search size={12} color="#4a4a60" />
        <span className="text-xs font-mono" style={{ color: "#4a4a60" }}>
          Search nodes...
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-[10px] font-mono">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background:
                connectionStatus === "connected"
                  ? "#10b981"
                  : connectionStatus === "reconnecting"
                  ? "#f59e0b"
                  : "#ef4444",
              boxShadow:
                connectionStatus === "connected"
                  ? "0 0 4px #10b981"
                  : "none",
            }}
          />
          <span
            style={{
              color:
                connectionStatus === "connected"
                  ? "#6ee7b7"
                  : connectionStatus === "reconnecting"
                  ? "#fcd34d"
                  : "#fca5a5",
            }}
          >
            {connectionStatus === "connected"
              ? "Live"
              : connectionStatus === "reconnecting"
              ? "Reconnecting..."
              : "Offline"}
          </span>
        </div>

        <span className="text-[10px] font-mono" style={{ color: "#8888a0" }}>
          <span style={{ color: "#a5b4fc" }}>{stats.nodeCount}</span> nodes
        </span>
        <span className="text-[10px] font-mono" style={{ color: "#8888a0" }}>
          <span style={{ color: "#a5b4fc" }}>{stats.edgeCount}</span> edges
        </span>
      </div>

      {/* User avatar */}
      <div
        className="flex items-center justify-center"
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "rgba(99,102,241,0.2)",
          border: "1px solid rgba(99,102,241,0.3)",
        }}
      >
        <span style={{ fontSize: 11, color: "#a5b4fc" }}>
          {String(username).charAt(0).toUpperCase()}
        </span>
      </div>
    </div>
  );
}
