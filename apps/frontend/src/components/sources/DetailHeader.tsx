import { ChevronLeft, GitBranch, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Source } from "@/hooks/useSources";

interface Props {
  source: Source | undefined;
  snapshotCount: number | null;
  onBack?: () => void;
}

export function DetailHeader({ source, snapshotCount, onBack }: Props) {
  if (!source) return <div className="detail-header muted">Select a source.</div>;
  const meta = source.meta ?? {};
  const stars = typeof meta.stars === "number" ? meta.stars : null;
  const description = typeof meta.description === "string" ? meta.description : null;
  const language = typeof meta.language === "string" ? meta.language : null;
  const topics = Array.isArray(meta.topics) ? meta.topics as string[] : [];
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
        {(source.default_branch || language) && (
          <div className="detail-header-meta">
            {source.default_branch && (
              <span><GitBranch size={10} /> {source.default_branch}</span>
            )}
            {language && <span> · {language}</span>}
            {stars !== null && (
              <span> · <Star size={10} /> {stars.toLocaleString()}</span>
            )}
          </div>
        )}
        {description && (
          <div className="detail-header-meta muted" style={{ fontSize: "var(--text-xs)" }}>
            {description}
          </div>
        )}
        {topics.length > 0 && (
          <div className="detail-header-meta" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {topics.slice(0, 6).map((t) => (
              <span key={t} className="source-tag">{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
