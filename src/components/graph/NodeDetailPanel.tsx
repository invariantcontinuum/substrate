import { useGraphStore } from "@/stores/graph";
import { X } from "lucide-react";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-2 border-b border-black last:border-0">
      <span>{label}</span>
      <span title={value}>{value}</span>
    </div>
  );
}

export function NodeDetailPanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectedNodeData = useGraphStore((s) => s.selectedNodeData);
  const selectNode = useGraphStore((s) => s.selectNode);

  const data = selectedNodeData;
  const nodeType = String(data?.type || "service");

  if (!selectedNodeId || !data) return null;

  return (
    <div className="shrink-0 flex flex-col overflow-hidden w-80 h-full bg-white border-l border-black text-black">
      <div className="px-4 py-3 border-b border-black flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 border border-black bg-black" />
          <div className="min-w-0">
            <div className="font-bold truncate" title={String(data.label || data.name || data.id)}>
              {String(data.label || data.name || data.id)}
            </div>
            <div className="truncate" title={nodeType}>{nodeType}</div>
          </div>
        </div>
        <button onClick={() => selectNode(null)} className="border border-black p-1">
          <X size={14} className="text-black" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <span className="block mb-2">Properties</span>
        <div className="border border-black p-3">
          {Object.entries(data).map(([key, value]) => {
            if (key === "id") return null;
            if (typeof value === "object" && value !== null) return null;
            return <DetailRow key={key} label={key} value={String(value ?? "—")} />;
          })}
        </div>

        <span className="block mt-4 mb-2">ID</span>
        <div className="border border-black p-2 break-all">{String(data.id)}</div>

        {(() => {
          const meta = data.meta;
          if (!meta || typeof meta !== "object") return null;
          const entries = Object.entries(meta as Record<string, unknown>);
          if (entries.length === 0) return null;
          return (
            <>
              <span className="block mt-4 mb-2">Metadata</span>
              <div className="border border-black p-3">
                {entries.map(([key, value]) => (
                  <DetailRow key={key} label={key} value={String(value ?? "—")} />
                ))}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
