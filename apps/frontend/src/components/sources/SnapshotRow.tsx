import type { SyncRun } from "@/hooks/useSyncs";
import { SnapshotRowSummary } from "./SnapshotRowSummary";
import { SnapshotExpandedDrawer } from "./SnapshotExpandedDrawer";

interface Props {
  run: SyncRun;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function SnapshotRow(props: Props) {
  return (
    <div
      className={`snapshot-row${props.isExpanded ? " is-expanded" : ""}`}
      onClick={props.onToggleExpand}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && props.onToggleExpand()}
    >
      <SnapshotRowSummary run={props.run} isExpanded={props.isExpanded} />
      {props.isExpanded && <SnapshotExpandedDrawer run={props.run} />}
    </div>
  );
}
