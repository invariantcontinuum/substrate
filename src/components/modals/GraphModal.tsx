import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { useGraphStore } from "@/stores/graph";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RotateCcw, Network } from "lucide-react";

/**
 * Graph configuration modal — first home for clustering / layout
 * tuning. The Leiden block is in production today; the structure is
 * intentionally a series of self-contained `.graph-config-section`
 * blocks so additional algorithms (force layout, edge bundling,
 * spatial pruning, hover preview) can be appended without re-doing
 * the layout.
 */
export function GraphModal() {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const config = useGraphStore((s) => s.graphConfig);
  const setLeiden = useGraphStore((s) => s.setLeidenConfig);
  const resetConfig = useGraphStore((s) => s.resetGraphConfig);

  return (
    <Modal
      open={activeModal === "graph"}
      onClose={closeModal}
      title="Graph Configuration"
      size="md"
    >
      <div className="graph-config">
        <section className="graph-config-section">
          <header className="graph-config-section-head">
            <div className="graph-config-section-title">
              <Network size={14} />
              <span>Leiden Communities</span>
            </div>
            <label className="graph-config-toggle">
              <input
                type="checkbox"
                checked={config.leiden.enabled}
                onChange={(e) => setLeiden({ enabled: e.target.checked })}
              />
              <span>{config.leiden.enabled ? "On" : "Off"}</span>
            </label>
          </header>
          <p className="graph-config-section-help">
            Detect cohesive sub-graphs using the Leiden refinement of Louvain.
            Higher resolution surfaces more, smaller communities; randomness
            (β) controls how aggressively the refinement perturbs assignments
            between passes.
          </p>

          <div className="graph-config-grid">
            <div>
              <Label>Resolution</Label>
              <Input
                type="number"
                step="0.1"
                min={0.1}
                max={10}
                value={config.leiden.resolution}
                onChange={(e) =>
                  setLeiden({ resolution: clamp(parseFloat(e.target.value), 0.1, 10) })
                }
                disabled={!config.leiden.enabled}
              />
            </div>
            <div>
              <Label>Randomness (β)</Label>
              <Input
                type="number"
                step="0.005"
                min={0}
                max={0.1}
                value={config.leiden.beta}
                onChange={(e) =>
                  setLeiden({ beta: clamp(parseFloat(e.target.value), 0, 0.1) })
                }
                disabled={!config.leiden.enabled}
              />
            </div>
            <div>
              <Label>Iterations</Label>
              <Input
                type="number"
                step="1"
                min={1}
                max={50}
                value={config.leiden.iterations}
                onChange={(e) =>
                  setLeiden({ iterations: clamp(parseInt(e.target.value, 10), 1, 50) })
                }
                disabled={!config.leiden.enabled}
              />
            </div>
            <div>
              <Label>Min cluster size</Label>
              <Input
                type="number"
                step="1"
                min={1}
                value={config.leiden.minClusterSize}
                onChange={(e) =>
                  setLeiden({
                    minClusterSize: Math.max(1, parseInt(e.target.value, 10) || 1),
                  })
                }
                disabled={!config.leiden.enabled}
              />
            </div>
          </div>
        </section>

        {/* Future sections (force layout, edge bundling, spatial
            clustering) slot in below as additional <section
            className="graph-config-section"> blocks — no further layout
            work needed. */}

        <div className="graph-config-actions">
          <Button onClick={resetConfig}>
            <RotateCcw size={14} />
            Reset to defaults
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
