// frontend/src/components/modals/sources/SnapshotOpsToolbar.tsx
import { Download, Upload, RefreshCw, Eraser, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSyncs } from "@/hooks/useSyncs";
import { useSyncSetStore } from "@/stores/syncSet";

interface Props {
  selectedSyncIds: Set<string>;
  onCleared?: () => void;
}

export function SnapshotOpsToolbar({ selectedSyncIds, onCleared }: Props) {
  const { retrySync, cleanSync, purgeSync } = useSyncs();
  const load = useSyncSetStore((s) => s.load);
  const unload = useSyncSetStore((s) => s.unload);
  const loadedIds = useSyncSetStore((s) => s.syncIds);

  const count = selectedSyncIds.size;
  const disabled = count === 0;
  const ids = [...selectedSyncIds];

  const doLoad = () => ids.forEach(load);
  const doUnload = () => ids.forEach(unload);
  const doRetry = async () => { for (const id of ids) await retrySync(id); };
  const doClean = async () => {
    // TODO: replace with themed ConfirmDialog once available
    if (!confirm(`Clean ${count} snapshot${count === 1 ? "" : "s"}? Graph data will be removed; row stays as audit.`)) return;
    for (const id of ids) await cleanSync(id);
    onCleared?.();
  };
  const doPurge = async () => {
    // TODO: replace with themed ConfirmDialog once available
    if (!confirm(`Purge ${count} snapshot${count === 1 ? "" : "s"}? Row AND data will be removed.`)) return;
    for (const id of ids) await purgeSync(id);
    onCleared?.();
  };

  const loadedCount = ids.filter((id) => loadedIds.includes(id)).length;
  const someLoaded = loadedCount > 0;
  const someUnloaded = ids.length > loadedCount;

  return (
    <div className="snapshot-ops-toolbar">
      <span className="snapshot-ops-toolbar-group-label">Snapshot {count > 0 && `(${count})`}</span>
      {someUnloaded && (
        <Button onClick={doLoad} disabled={disabled}>
          <Download size={12} /> Load{someLoaded ? ` (${ids.length - loadedCount})` : ""}
        </Button>
      )}
      {someLoaded && (
        <Button onClick={doUnload} disabled={disabled}>
          <Upload size={12} /> Unload{someUnloaded ? ` (${loadedCount})` : ""}
        </Button>
      )}
      <Button onClick={doRetry} disabled={disabled}><RefreshCw size={12} /> Retry</Button>
      <Button onClick={doClean} disabled={disabled}><Eraser size={12} /> Clean</Button>
      <Button onClick={doPurge} disabled={disabled} className="danger"><Trash2 size={12} /> Purge</Button>
    </div>
  );
}
