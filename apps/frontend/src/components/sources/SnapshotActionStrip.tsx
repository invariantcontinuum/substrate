import { useState } from "react";
import { RotateCw, Plus, Minus, Download, Eraser, Trash2 } from "lucide-react";
import type { SyncRun } from "@/hooks/useSyncs";
import { useSyncs } from "@/hooks/useSyncs";
import { useSyncSetStore } from "@/stores/syncSet";
import { useResyncSnapshot } from "@/hooks/useResyncSnapshot";
import { useExportSnapshot } from "@/hooks/useExportSnapshot";
import { PurgeConfirmModal } from "./PurgeConfirmModal";

interface Props {
  run: SyncRun;
}

export function SnapshotActionStrip({ run }: Props) {
  const isLoaded = useSyncSetStore((s) => s.syncIds.includes(run.id));
  const load = useSyncSetStore((s) => s.load);
  const unload = useSyncSetStore((s) => s.unload);
  const { cleanSync, purgeSync } = useSyncs();
  const exportSnap = useExportSnapshot();
  const resync = useResyncSnapshot();
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgePending, setPurgePending] = useState(false);

  const eligibleResync =
    (run.status === "failed" || run.status === "cancelled") &&
    run.resume_cursor != null;

  return (
    <div className="snapshot-row-actions" onClick={(e) => e.stopPropagation()}>
      {eligibleResync && (
        <button
          type="button"
          className="snapshot-row-icon"
          title="Resume sync from last successful batch"
          aria-label="Resume sync"
          disabled={resync.isPending}
          onClick={() => resync.mutate(run.id)}
        >
          <RotateCw size={12} />
        </button>
      )}
      <button
        type="button"
        className="snapshot-row-icon"
        title={isLoaded ? "Unload from graph" : "Load onto graph"}
        aria-label={isLoaded ? "Unload" : "Load"}
        onClick={() => (isLoaded ? unload(run.id) : load(run.id))}
      >
        {isLoaded ? <Minus size={12} /> : <Plus size={12} />}
      </button>
      <button
        type="button"
        className="snapshot-row-icon"
        title="Export this snapshot as JSON"
        aria-label="Export snapshot"
        onClick={() => {
          void exportSnap(run.id).catch(console.error);
        }}
      >
        <Download size={12} />
      </button>
      <button
        type="button"
        className="snapshot-row-icon"
        title="Clean — drop embeddings, keep file rows"
        aria-label="Clean snapshot"
        onClick={() => {
          void cleanSync(run.id);
        }}
      >
        <Eraser size={12} />
      </button>
      <button
        type="button"
        className="snapshot-row-icon is-destructive"
        title="Purge — drop everything for this snapshot"
        aria-label="Purge snapshot"
        onClick={() => setPurgeOpen(true)}
      >
        <Trash2 size={12} />
      </button>
      <PurgeConfirmModal
        isOpen={purgeOpen}
        onClose={() => setPurgeOpen(false)}
        onConfirm={async () => {
          setPurgePending(true);
          try {
            await purgeSync(run.id);
          } finally {
            setPurgePending(false);
            setPurgeOpen(false);
          }
        }}
        syncIdShort={run.id.slice(0, 8)}
        isPending={purgePending}
      />
    </div>
  );
}
