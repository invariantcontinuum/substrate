// frontend/src/components/sources/UnifiedToolbar.tsx
import { Download, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSyncSetStore } from "@/stores/syncSet";
import { useExportGraph } from "@/hooks/useExportGraph";
import { AddSourceInput } from "./AddSourceInput";

interface Props {
  // Toggled by the Schedule button. Per-source schedule editing now lives in
  // each row's `…` menu (Task 2). The boolean is reserved for a future global
  // schedule overview panel; no consumer renders that panel yet.
  scheduleExpanded: boolean;
  onToggleSchedule: () => void;
}

export function UnifiedToolbar({ scheduleExpanded, onToggleSchedule }: Props) {
  const loadedIds = useSyncSetStore((s) => s.syncIds);
  const exportGraph = useExportGraph();
  return (
    <div className="unified-toolbar">
      <AddSourceInput />
      <Button
        onClick={onToggleSchedule}
        title="Toggle schedule overview (panel UI lands in a follow-up task)"
        className={scheduleExpanded ? "is-active" : ""}
      >
        <Clock size={14} /> Schedule {scheduleExpanded ? "▴" : "▾"}
      </Button>
      <Button
        disabled={loadedIds.length === 0}
        title="Export the loaded graph + all source files as JSON"
        onClick={() => { void exportGraph(loadedIds).catch(console.error); }}
      >
        <Download size={14} /> Export Graph
      </Button>
      <div className="unified-toolbar-spacer" />
      {/* ChatContextSummaryPill wired in Task 6 — placeholder div for layout */}
      <div className="chat-context-pill-slot" aria-hidden="true" />
    </div>
  );
}
