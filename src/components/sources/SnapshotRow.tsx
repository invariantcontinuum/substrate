// frontend/src/components/sources/SnapshotRow.tsx
import type { SyncRun } from "@/hooks/useSyncs";
import { SnapshotRowSummary } from "./SnapshotRowSummary";
import { SnapshotIssuesInline } from "./SnapshotIssuesInline";

interface Props {
  run: SyncRun;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}

export function SnapshotRow(props: Props) {
  return (
    <div className={`snapshot-row${props.isExpanded ? " is-expanded" : ""}`}>
      <SnapshotRowSummary {...props} />
      {props.isExpanded && <SnapshotIssuesInline run={props.run} />}
    </div>
  );
}
