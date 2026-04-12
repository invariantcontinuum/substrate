import { useEffect, useState, useRef } from "react";
import { useJobs } from "@/hooks/useJobs";
import { useGraphStore } from "@/stores/graph";

interface Signal {
  id: string;
  color: string;
  label: string;
  ts: number;
}

const C = {
  sync: "#22d3ee",
  complete: "#34d399",
  error: "#ef4444",
  parse: "#a78bfa",
  discover: "#fbbf24",
} as const;

export function SignalsOverlay() {
  const { jobs } = useJobs();
  const stats = useGraphStore((s) => s.stats);
  const [signals, setSignals] = useState<Signal[]>([]);
  const lastSeenStatus = useRef<Map<string, string>>(new Map());

  // Live signals derived from currently-running jobs
  const liveSignals: Signal[] = [];
  for (const job of jobs) {
    if (job.status !== "running") continue;
    const m = job.progress_meta;
    if (!m) {
      liveSignals.push({ id: `${job.id}-live`, color: C.sync, label: "syncing...", ts: 0 });
      continue;
    }
    const repo = m.repo || "...";
    switch (m.phase) {
      case "cloning":
        liveSignals.push({ id: `${job.id}-live`, color: C.sync, label: `cloning ${repo}`, ts: 0 });
        break;
      case "discovering":
        liveSignals.push({
          id: `${job.id}-live`, color: C.discover, ts: 0,
          label: m.files_total > 0
            ? `discovered ${m.files_total} files (${m.files_parseable} parseable)`
            : `scanning ${repo}...`,
        });
        break;
      case "parsing":
        liveSignals.push({
          id: `${job.id}-live`, color: C.parse, ts: 0,
          label: `parsing ${m.files_parsed}/${m.files_parseable} \u00b7 ${m.edges_found} edges`,
        });
        break;
      case "publishing":
        liveSignals.push({
          id: `${job.id}-live`, color: C.complete, ts: 0,
          label: `publishing ${m.files_total} nodes, ${m.edges_found} edges`,
        });
        break;
      default:
        liveSignals.push({ id: `${job.id}-live`, color: C.sync, label: `syncing ${repo}...`, ts: 0 });
    }
  }

  // Historical signals from status transitions
  useEffect(() => {
    const next: Signal[] = [];
    for (const job of jobs) {
      const prev = lastSeenStatus.current.get(job.id);
      if (prev === job.status) continue;
      lastSeenStatus.current.set(job.id, job.status);

      const m = job.progress_meta;
      const repo = m?.repo ?? (job.scope as { repo_url?: string }).repo_url ?? "unknown";

      if (job.status === "running" && !prev) {
        next.push({ id: `${job.id}-start`, color: C.sync, label: `sync started: ${repo}`, ts: Date.now() });
      } else if (job.status === "completed" && prev !== "completed") {
        const nodes = m?.files_total ?? stats.nodeCount;
        const edges = m?.edges_found ?? stats.edgeCount;
        const types = m?.nodes_by_type;
        let detail = `${nodes} nodes, ${edges} edges`;
        if (types) {
          const top = Object.entries(types)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([t, c]) => `${c} ${t}`)
            .join(", ");
          if (top) detail += ` (${top})`;
        }
        next.push({ id: `${job.id}-done`, color: C.complete, label: `synced: ${detail}`, ts: Date.now() });
      } else if (job.status === "failed" && prev !== "failed") {
        next.push({ id: `${job.id}-err`, color: C.error, label: `sync failed: ${job.error ?? "unknown"}`, ts: Date.now() });
      }
    }
    if (next.length > 0) {
      setSignals((prev) => [...next, ...prev].slice(0, 8));
    }
  }, [jobs, stats]);

  const all = [...liveSignals, ...signals].slice(0, 8);
  if (all.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-3 sm:bottom-6 sm:left-6 z-10 flex flex-col gap-1 pointer-events-none">
      {all.map((s, i) => (
        <div
          key={`${s.id}-${s.ts}`}
          className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono signal-line"
          style={{
            color: "#8888a0",
            opacity: 1 - i * 0.12,
            animationDelay: `${i * 40}ms`,
          }}
        >
          <span style={{ color: s.color, fontSize: 5 }}>&#x25CF;</span>
          <span className="truncate max-w-[200px] sm:max-w-none">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
