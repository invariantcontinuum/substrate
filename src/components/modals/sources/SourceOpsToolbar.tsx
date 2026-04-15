// frontend/src/components/modals/sources/SourceOpsToolbar.tsx
import { RefreshCw, Clock, Settings, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSyncs } from "@/hooks/useSyncs";
import { useSources } from "@/hooks/useSources";

interface Props {
  selectedSourceIds: Set<string>;
  onOpenSchedule: (sourceId: string) => void;
  onOpenConfig: (sourceId: string) => void;
}

export function SourceOpsToolbar({ selectedSourceIds, onOpenSchedule, onOpenConfig }: Props) {
  const { startSync, cancelSync, activeSyncs } = useSyncs();
  const { purgeSource } = useSources();
  const count = selectedSourceIds.size;
  const multi = count > 1;
  const disabled = count === 0;
  const syncLabel = disabled ? "Sync" : multi ? `Sync (${count} sources)` : "Sync";

  const singleId = count === 1 ? [...selectedSourceIds][0] : null;

  const doSync = async () => {
    for (const id of selectedSourceIds) await startSync({ source_id: id });
  };
  const doStop = async () => {
    for (const id of selectedSourceIds) {
      const active = activeSyncs.find((r) => r.source_id === id);
      if (active) await cancelSync(active.id);
    }
  };
  const doPurgeSource = async () => {
    if (!confirm(`Purge ${count} source${count === 1 ? "" : "s"} and all snapshots?`)) return;
    for (const id of selectedSourceIds) await purgeSource(id);
  };

  return (
    <div className="source-ops-toolbar">
      <span className="source-ops-toolbar-group-label">Source</span>
      <Button onClick={doSync} disabled={disabled}>
        <RefreshCw size={12} /> {syncLabel}
      </Button>
      <Button onClick={() => singleId && onOpenSchedule(singleId)} disabled={count !== 1} title="Schedule (single source only)">
        <Clock size={12} /> Schedule…
      </Button>
      <Button onClick={doStop} disabled={disabled} title="Stop running sync">
        <Square size={12} /> Stop
      </Button>
      <Button onClick={() => singleId && onOpenConfig(singleId)} disabled={count !== 1} title="Config (single source only)">
        <Settings size={12} /> Config…
      </Button>
      <Button onClick={doPurgeSource} disabled={disabled} className="danger">
        <Trash2 size={12} /> Purge source{multi ? "s" : ""}
      </Button>
    </div>
  );
}
