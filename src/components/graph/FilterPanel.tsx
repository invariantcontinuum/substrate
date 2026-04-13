import { useGraphStore } from "@/stores/graph";

const nodeTypes = [
  { type: "service", label: "Service" },
  { type: "database", label: "Database" },
  { type: "cache", label: "Cache" },
  { type: "external", label: "External" },
];

const layouts = [
  { value: "force" as const, label: "Force" },
  { value: "hierarchical" as const, label: "Hierarchy" },
];

export function FilterPanel() {
  const { filters, toggleTypeFilter, layout, setLayout, stats } = useGraphStore();

  return (
    <div className="w-44 border-r border-black bg-white p-2 h-full flex flex-col text-black">
      <div className="mb-2">Node Types</div>
      <div className="flex flex-col">
        {nodeTypes.map((nt) => {
          const active = filters.types.has(nt.type);
          return (
            <button key={nt.type} onClick={() => toggleTypeFilter(nt.type)} className="text-left py-1 px-1 border border-black mb-1 flex items-center gap-2">
              <div className={`w-2.5 h-2.5 border border-black ${active ? "bg-black" : "bg-white"}`} />
              <span>{nt.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 mb-2">Layout</div>
      <div className="flex flex-col">
        {layouts.map((l) => (
          <button key={l.value} onClick={() => setLayout(l.value)} className={`text-left px-2 py-1 border border-black mb-1 ${layout === l.value ? "bg-black text-white" : "bg-white text-black"}`}>
            {l.label}
          </button>
        ))}
      </div>

      <div className="mt-4 pt-2 border-t border-black">
        <div className="mb-2">Graph</div>
        <div className="flex flex-col">
          <div className="flex justify-between">
            <span>Nodes</span>
            <span>{stats.nodeCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Edges</span>
            <span>{stats.edgeCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
