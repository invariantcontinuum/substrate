import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { useGraphStore } from "@/stores/graph";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Network, RotateCcw, Sparkles } from "lucide-react";

/**
 * Enrichment modal hosts two concerns:
 *   1. A short blurb about the inline enrichment pipeline (summaries +
 *      embeddings are produced during sync).
 *   2. Graph-rendering / clustering configuration (Leiden communities,
 *      plus future force-layout / edge-bundling / spatial-pruning
 *      blocks). This block used to live in a dedicated GraphModal;
 *      merged here because the "Graph" sidebar item now navigates to
 *      the canvas view itself and has no modal of its own.
 */
export function EnrichmentModal() {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const config = useGraphStore((s) => s.graphConfig);
  const setLeiden = useGraphStore((s) => s.setLeidenConfig);
  const resetConfig = useGraphStore((s) => s.resetGraphConfig);

  return (
    <Modal
      open={activeModal === "enrichment"}
      onClose={closeModal}
      title="Enrichment"
      size="md"
    >
      <div className="enrichment-modal">
        <p style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Sparkles size={16} /> Standalone enrichment is being refactored.
        </p>
        <p>
          LLM-generated summaries and embeddings now run inline during sync.
          A dedicated re-enrichment workflow will return in a future update.
        </p>

        <div className="graph-config" style={{ marginTop: "1.25rem" }}>
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

          <div className="graph-config-actions">
            <Button onClick={resetConfig}>
              <RotateCcw size={14} />
              Reset to defaults
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
