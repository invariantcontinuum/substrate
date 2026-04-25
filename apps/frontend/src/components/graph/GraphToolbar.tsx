import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";

export function GraphToolbar() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const openModal = useUIStore((s) => s.openModal);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (selectedNodeId == null) return;
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 800);
    return () => clearTimeout(t);
  }, [selectedNodeId]);

  return (
    <div className="graph-toolbar">
      <button
        type="button"
        className={`graph-toolbar-button${pulsing ? " is-pulsing" : ""}`}
        disabled={selectedNodeId == null}
        title={selectedNodeId == null ? "Click a node to enable" : "Show node details"}
        aria-label="Show node details"
        onClick={() => openModal("nodeDetail")}
      >
        <Info size={16} />
      </button>
    </div>
  );
}
