import { useEffect, useState, useRef } from "react";
import { useJobs } from "@/hooks/useJobs";
import { useGraphStore } from "@/stores/graph";
import { logger } from "@/lib/logger";

interface Signal {
  id: string;
  label: string;
  ts: number;
}

export function SignalsOverlay() {
  const { jobs } = useJobs();
  const stats = useGraphStore((s) => s.stats);
  const [signals, setSignals] = useState<Signal[]>([]);
  const lastSeenStatus = useRef<Map<string, string>>(new Map());

  const liveSignals: Signal[] = [];
  for (const job of jobs) {
    if (job.status !== "running") continue;
    const m = job.progress_meta;
    const repo = m?.repo || "...";
    if (!m) {
      liveSignals.push({ id: `${job.id}-live`, label: "syncing...", ts: 0 });
      continue;
    }
    switch (m.phase) {
      case "cloning":
        liveSignals.push({ id: `${job.id}-live`, label: `cloning ${repo}`, ts: 0 });
        break;
      case "discovering":
        liveSignals.push({
          id: `${job.id}-live`, ts: 0,
          label: m.files_total > 0
            ? `discovered ${m.files_total} files (${m.files_parseable} parseable)`
            : `scanning ${repo}...`,
        });
        break;
      case "parsing":
        liveSignals.push({
          id: `${job.id}-live`, ts: 0,
          label: `parsing ${m.files_parsed}/${m.files_parseable} · ${m.edges_found} edges`,
        });
        break;
      case "publishing":
        liveSignals.push({
          id: `${job.id}-live`, ts: 0,
          label: `publishing ${m.files_total} nodes, ${m.edges_found} edges`,
        });
        break;
      default:
        liveSignals.push({ id: `${job.id}-live`, label: `syncing ${repo}...`, ts: 0 });
    }
  }

  useEffect(() => {
    const next: Signal[] = [];
    for (const job of jobs) {
      const prev = lastSeenStatus.current.get(job.id);
      if (prev === job.status) continue;
      lastSeenStatus.current.set(job.id, job.status);

      const m = job.progress_meta;
      const repo = m?.repo ?? (job.scope as { repo_url?: string }).repo_url ?? "unknown";

      if (job.status === "running" && !prev) {
        next.push({ id: `${job.id}-start`, label: `sync started: ${repo}`, ts: Date.now() });
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
        next.push({ id: `${job.id}-done`, label: `synced: ${detail}`, ts: Date.now() });
      } else if (job.status === "failed" && prev !== "failed") {
        next.push({ id: `${job.id}-err`, label: `sync failed: ${job.error ?? "unknown"}`, ts: Date.now() });
      }
    }
    if (next.length > 0) {
      for (const s of next) {
        logger.info("signal_status_transition", { signalId: s.id, label: s.label });
      }
      setSignals((prev) => [...next, ...prev].slice(0, 8));
    }
  }, [jobs, stats]);

  const all = [...liveSignals, ...signals].slice(0, 8);
  if (all.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-3 border border-black bg-white p-2 text-black z-10">
      {all.map((s) => (
        <div key={`${s.id}-${s.ts}`}>{s.label}</div>
      ))}
    </div>
  );
}
