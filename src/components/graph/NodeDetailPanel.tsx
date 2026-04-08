import { useGraphStore } from "@/stores/graph";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "react-oidc-context";
import { apiFetch } from "@/lib/api";

export function NodeDetailPanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const auth = useAuth();
  const token = auth.user?.access_token;

  const { data } = useQuery({
    queryKey: ["node", selectedNodeId],
    queryFn: () =>
      apiFetch<Record<string, unknown>>(
        `/api/graph/nodes/${selectedNodeId}`,
        token
      ),
    enabled: !!selectedNodeId && !!token,
  });

  if (!selectedNodeId) return null;

  return (
    <div
      className="overflow-y-auto p-3"
      style={{
        width: 260,
        borderLeft: "1px solid var(--border)",
        background: "var(--bg-surface)",
      }}
    >
      <div
        className="text-[9px] uppercase tracking-[0.15em] mb-2.5"
        style={{ color: "var(--text-muted)" }}
      >
        Selected Node
      </div>

      <div
        className="rounded-lg p-3 mb-3"
        style={{
          background: "rgba(15,15,31,0.6)",
          border: "1px solid rgba(99,102,241,0.2)",
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-sm"
            style={{
              background: "#0f0f1f",
              border: "1.5px solid #3b4199",
            }}
          />
          <span className="text-[13px] font-semibold" style={{ color: "#c7d2fe" }}>
            {selectedNodeId}
          </span>
        </div>
      </div>

      {data && (
        <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
          <pre className="whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
