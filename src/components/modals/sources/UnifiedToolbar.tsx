// frontend/src/components/modals/sources/UnifiedToolbar.tsx
import { useState } from "react";
import { RefreshCw, Clock, Settings, Square, Trash2, Download, Upload, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useSyncs } from "@/hooks/useSyncs";
import { useSources } from "@/hooks/useSources";
import { useSchedules } from "@/hooks/useSchedules";
import { useSyncSetStore } from "@/stores/syncSet";

const INTERVAL_OPTIONS = [
  { label: "5 min", value: 5 }, { label: "15 min", value: 15 },
  { label: "30 min", value: 30 }, { label: "1 hour", value: 60 },
  { label: "6 hours", value: 360 }, { label: "24 hours", value: 1440 },
];

interface Props {
  selectedSourceIds: Set<string>;
  selectedSyncIds: Set<string>;
  scheduleExpanded: boolean;
  onToggleSchedule: () => void;
  onSnapshotActionComplete: () => void;
  onSourceActionComplete: () => void;
}

export function UnifiedToolbar(props: Props) {
  const { selectedSourceIds, selectedSyncIds, scheduleExpanded, onToggleSchedule,
          onSnapshotActionComplete, onSourceActionComplete } = props;
  const { startSync, cancelSync, cleanSync, purgeSync, activeSyncs } = useSyncs();
  const { purgeSource } = useSources();
  const { createSchedule } = useSchedules();
  const load = useSyncSetStore((s) => s.load);
  const unload = useSyncSetStore((s) => s.unload);
  const loadedIds = useSyncSetStore((s) => s.syncIds);

  const [interval, setInterval] = useState(60);

  const snapshotMode = selectedSyncIds.size > 0;
  const sourceMode = !snapshotMode && selectedSourceIds.size > 0;

  // Snapshot mode — operate on selected sync_ids.
  const snapshotIds = Array.from(selectedSyncIds);
  const snapshotLoadedCount = snapshotIds.filter((id) => loadedIds.includes(id)).length;
  const snapshotSomeLoaded = snapshotLoadedCount > 0;
  const snapshotSomeUnloaded = snapshotIds.length > snapshotLoadedCount;

  const doLoad = () => {
    snapshotIds.forEach(load);
    onSnapshotActionComplete();
  };
  const doUnload = () => {
    snapshotIds.forEach(unload);
    onSnapshotActionComplete();
  };
  const doClean = () => {
    // TODO: replace with themed ConfirmDialog once available
    if (!confirm(`Clean ${snapshotIds.length} snapshot${snapshotIds.length === 1 ? "" : "s"}? Graph data removed; row stays as audit.`)) return;
    // Fire-and-forget: don't await, so the UI doesn't block on slow backends.
    snapshotIds.forEach((id) => { void cleanSync(id); });
    onSnapshotActionComplete();
  };
  const doPurge = () => {
    // TODO: replace with themed ConfirmDialog once available
    if (!confirm(`Purge ${snapshotIds.length} snapshot${snapshotIds.length === 1 ? "" : "s"}? Row AND data removed.`)) return;
    snapshotIds.forEach((id) => { void purgeSync(id); });
    onSnapshotActionComplete();
  };

  // Source mode — operate on selected source_ids.
  const sourceIds = Array.from(selectedSourceIds);
  const selectedSingleSource = sourceIds.length === 1 ? sourceIds[0] : null;
  // Stop button: only visible when any selected source has a pending/running sync.
  const selectedRunningSyncs = activeSyncs.filter((r) => selectedSourceIds.has(r.source_id));
  const hasRunning = selectedRunningSyncs.length > 0;
  const multi = sourceIds.length > 1;
  const syncLabel = multi ? `Sync (${sourceIds.length} sources)` : "Sync";

  const doSync = () => {
    // Fire-and-forget, parallel.
    sourceIds.forEach((id) => { void startSync({ source_id: id }); });
    onSourceActionComplete();
  };
  const doStop = () => {
    selectedRunningSyncs.forEach((r) => { void cancelSync(r.id); });
    onSourceActionComplete();
  };
  const doPurgeSource = () => {
    // TODO: replace with themed ConfirmDialog once available
    if (!confirm(`Purge ${sourceIds.length} source${sourceIds.length === 1 ? "" : "s"} and all their snapshots?`)) return;
    sourceIds.forEach((id) => { void purgeSource(id); });
    onSourceActionComplete();
  };
  const doSaveSchedule = async () => {
    await Promise.all(sourceIds.map((source_id) =>
      createSchedule({ source_id, interval_minutes: interval })
    ));
    onSourceActionComplete();
  };

  // Rendering
  if (!snapshotMode && !sourceMode) {
    return (
      <div className="unified-toolbar unified-toolbar-empty">
        <span className="unified-toolbar-hint muted">Select sources or snapshots to act on them.</span>
      </div>
    );
  }

  if (snapshotMode) {
    return (
      <div className="unified-toolbar">
        <span className="unified-toolbar-label">Snapshot ({snapshotIds.length})</span>
        {snapshotSomeUnloaded && (
          <Button onClick={doLoad}>
            <Download size={12} /> Load{snapshotSomeLoaded ? ` (${snapshotIds.length - snapshotLoadedCount})` : ""}
          </Button>
        )}
        {snapshotSomeLoaded && (
          <Button onClick={doUnload}>
            <Upload size={12} /> Unload{snapshotSomeUnloaded ? ` (${snapshotLoadedCount})` : ""}
          </Button>
        )}
        <Button onClick={doClean}><Eraser size={12} /> Clean</Button>
        <Button onClick={doPurge} className="danger"><Trash2 size={12} /> Purge</Button>
      </div>
    );
  }

  // sourceMode
  return (
    <>
      <div className="unified-toolbar">
        <span className="unified-toolbar-label">Source ({sourceIds.length})</span>
        <Button onClick={doSync}><RefreshCw size={12} /> {syncLabel}</Button>
        <Button onClick={doStop} style={{ display: hasRunning ? undefined : "none" }}>
          <Square size={12} /> Stop{selectedRunningSyncs.length > 1 ? ` (${selectedRunningSyncs.length})` : ""}
        </Button>
        <Button onClick={onToggleSchedule} className={scheduleExpanded ? "is-active" : ""}>
          <Clock size={12} /> Set Schedule
        </Button>
        {selectedSingleSource && (
          <Button onClick={() => { /* config dialog re-integration point; left for later */ }}
                  disabled>
            <Settings size={12} /> Config…
          </Button>
        )}
        <Button onClick={doPurgeSource} className="danger"><Trash2 size={12} /> Purge source{multi ? "s" : ""}</Button>
      </div>
      {scheduleExpanded && (
        <div className="unified-schedule-row">
          <Label>Every</Label>
          <Select value={String(interval)} onValueChange={(v) => v && setInterval(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {INTERVAL_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => { void doSaveSchedule(); onToggleSchedule(); }}>Save schedule</Button>
          <Button onClick={onToggleSchedule}>Cancel</Button>
        </div>
      )}
    </>
  );
}
