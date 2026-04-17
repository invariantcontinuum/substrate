import { ChevronRight, Eye } from "lucide-react";
import type { Source } from "@/hooks/useSources";

interface Props {
  source: Source;
  isActive: boolean;
  isSelected: boolean;
  isLoaded: boolean;
  isRunning: boolean;
  onNavigate: () => void;
  onToggleSelect: () => void;
}

export function SourceListItem(props: Props) {
  const { source, isActive, isSelected, isLoaded, isRunning, onNavigate, onToggleSelect } = props;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onNavigate()}
      className={`source-list-item${isActive ? " is-active" : ""}`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => { e.stopPropagation(); onToggleSelect(); }}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${source.owner}/${source.name}`}
        className="source-list-item-cb"
      />
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
      <ChevronRight size={12} className="source-list-item-chevron" />
    </div>
  );
}
