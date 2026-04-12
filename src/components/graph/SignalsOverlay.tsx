import { useEffect, useState, useRef } from "react";
import { useJobs } from "@/hooks/useJobs";
import { useGraphStore } from "@/stores/graph";

interface Signal {
  id: string;
  color: string;
  label: string;
  ts: number;
}

const SIGNAL_COLORS = {
  commit: "#10b981",
  sync: "#22d3ee",
  complete: "#34d399",
  error: "#ef4444",
  violation: "#ef4444",
  why: "#fbbf24",
  drift: "#f472b6",
  nodes: "#22d3ee",
} as const;

export function SignalsOverlay() {
  const { jobs } = useJobs();
  const stats = useGraphStore((s) => s.stats);
  const [signals, setSignals] = useState<Signal[]>([]);
  const lastSeenStatus = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const next: Signal[] = [];
    for (const job of jobs) {
      const prev = lastSeenStatus.current.get(job.id);
      if (prev === job.status) continue;
      lastSeenStatus.current.set(job.id, job.status);

      const scope = job.scope ?? {};
      const repoUrl = (scope as { repo_url?: string }).repo_url ?? "unknown";

      if (job.status === "running" && !prev) {
        next.push({
          id: `${job.id}-start`,
          color: SIGNAL_COLORS.sync,
          label: `sync started: ${repoUrl}`,
          ts: Date.now(),
        });
      } else if (job.status === "completed" && prev !== "completed") {
        const nodeCount = stats.nodeCount;
        const edgeCount = stats.edgeCount;
        if (nodeCount > 0) {
          next.push({
            id: `${job.id}-done`,
            color: SIGNAL_COLORS.complete,
            label: `sync complete: ${nodeCount} nodes, ${edgeCount} edges`,
            ts: Date.now(),
          });
        } else {
          next.push({
            id: `${job.id}-done`,
            color: SIGNAL_COLORS.complete,
            label: `sync complete: ${job.progress_done} files parsed`,
            ts: Date.now(),
          });
        }
      } else if (job.status === "failed" && prev !== "failed") {
        next.push({
          id: `${job.id}-err`,
          color: SIGNAL_COLORS.error,
          label: `sync failed: ${job.error ?? "unknown"}`,
          ts: Date.now(),
        });
      }
    }
    if (next.length > 0) {
      setSignals((prev) => [...next, ...prev].slice(0, 5));
    }
  }, [jobs, stats]);

  return (
    <div className="absolute bottom-3 left-3 sm:bottom-6 sm:left-6 z-10 flex flex-col gap-1 pointer-events-none">
      {signals.map((s, i) => (
        <div
          key={`${s.id}-${s.ts}`}
          className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono signal-line"
          style={{
            color: "#8888a0",
            opacity: 1 - i * 0.18,
            animationDelay: `${i * 40}ms`,
          }}
        >
          <span style={{ color: s.color, fontSize: 5 }}>●</span>
          <span className="truncate max-w-[200px] sm:max-w-none">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
