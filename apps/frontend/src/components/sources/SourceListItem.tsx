import { ChevronRight, Eye } from "lucide-react";
import type { Source } from "@/hooks/useSources";
import { SourceActionMenu } from "./SourceActionMenu";

interface Props {
  source: Source;
  isActive: boolean;
  isLoaded: boolean;
  isRunning: boolean;
  onNavigate: () => void;
}

export function SourceListItem({ source, isActive, isLoaded, isRunning, onNavigate }: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onNavigate()}
      className={`source-list-item${isActive ? " is-active" : ""}`}
    >
      <span className="source-list-item-label">
        {source.owner}/{source.name}
      </span>
      {isLoaded && (
        <Eye
          size={14}
          className="source-list-item-loaded-icon"
          aria-label="Loaded on graph"
        />
      )}
      {isRunning && <span className="source-list-item-chip running">●</span>}
      <SourceActionMenu
        sourceId={source.id}
        sourceLabel={`${source.owner}/${source.name}`}
      />
      <ChevronRight size={12} className="source-list-item-chevron" />
    </div>
  );
}
