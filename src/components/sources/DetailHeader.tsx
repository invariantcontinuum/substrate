import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Source } from "@/hooks/useSources";

interface Props {
  source: Source | undefined;
  snapshotCount: number | null;
  onBack?: () => void;
}

export function DetailHeader({ source, snapshotCount, onBack }: Props) {
  if (!source) return <div className="detail-header muted">Select a source.</div>;
  return (
    <div className="detail-header">
      {onBack && (
        <Button onClick={onBack} className="detail-header-back">
          <ChevronLeft size={14} /> Sources
        </Button>
      )}
      <div className="detail-header-body">
        <div className="detail-header-title">{source.owner}/{source.name}</div>
        <div className="detail-header-meta">
          <span>{source.url}</span>
          {snapshotCount !== null && <span> · {snapshotCount} snapshot{snapshotCount === 1 ? "" : "s"}</span>}
        </div>
      </div>
    </div>
  );
}
