import { useGraphStore } from "@/stores/graph";
import { Button } from "@/components/ui/button";

export function FilterPanel() {
  const { filters, setFilters, resetFilters } = useGraphStore();
  const layers = ["infra", "platform", "domain", "app", "data"];

  const toggle = (layer: string) => {
    const next = filters.layers.includes(layer)
      ? filters.layers.filter((l) => l !== layer)
      : [...filters.layers, layer];
    setFilters({ ...filters, layers: next });
  };

  return (
    <div className="filter-panel">
      <div className="filter-panel-header">
        <h4>Layers</h4>
        <Button onClick={resetFilters}>Reset</Button>
      </div>
      <div className="filter-panel-body">
        {layers.map((layer) => (
          <label key={layer} className="filter-panel-row">
            <input
              type="checkbox"
              checked={filters.layers.includes(layer)}
              onChange={() => toggle(layer)}
            />
            <span>{layer}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
