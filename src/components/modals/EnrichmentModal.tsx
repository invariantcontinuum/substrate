import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { useJobs } from "@/hooks/useJobs";
import { Sparkles, Loader2 } from "lucide-react";

export function EnrichmentModal() {
  const { activeModal, closeModal } = useUIStore();
  const { runJob, isRunning, jobs } = useJobs();

  const [repoUrl, setRepoUrl] = useState("");
  const [limit, setLimit] = useState(100);
  const [unenrichedOnly, setUnenrichedOnly] = useState(true);

  const enrichJobs = jobs.filter((j) => j.job_type === "enrich");
  const latestEnrich = enrichJobs[0];

  const handleEnrich = () => {
    if (!repoUrl.trim()) return;
    runJob({
      jobType: "enrich",
      scope: { repo_url: repoUrl.trim(), limit, unenriched_only: unenrichedOnly },
    });
  };

  return (
    <Modal open={activeModal === "enrichment"} onClose={closeModal} title="Enrichment" maxWidth={480}>
      <div className="flex flex-col gap-5">
        <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          Use local LLM to generate descriptions, classifications, and embeddings for graph nodes.
        </div>

        {/* Repo URL */}
        <div>
          <div className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: "var(--text-muted)" }}>
            Repository
          </div>
          <input
            type="text"
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="w-full text-[11px] px-3 py-2 rounded-lg outline-none"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-primary)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
        </div>

        {/* Scope config */}
        <div className="flex gap-4">
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: "var(--text-muted)" }}>
              Limit
            </div>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full text-[11px] px-3 py-2 rounded-lg outline-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: "var(--text-muted)" }}>
              Mode
            </div>
            <button
              onClick={() => setUnenrichedOnly(!unenrichedOnly)}
              className="w-full text-[11px] px-3 py-2 rounded-lg text-left"
              style={{
                background: unenrichedOnly ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${unenrichedOnly ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.08)"}`,
                color: unenrichedOnly ? "#a5b4fc" : "var(--text-muted)",
              }}
            >
              {unenrichedOnly ? "Unenriched only" : "All nodes"}
            </button>
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={handleEnrich}
          disabled={!repoUrl.trim() || isRunning}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-medium transition-colors"
          style={{
            background: "rgba(168,85,247,0.1)",
            border: "1px solid rgba(168,85,247,0.2)",
            color: "#c084fc",
            opacity: !repoUrl.trim() || isRunning ? 0.4 : 1,
          }}
        >
          {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Run Enrichment
        </button>

        {/* Latest job status */}
        {latestEnrich && (
          <div
            className="px-3 py-2 rounded-lg text-[11px]"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", fontFamily: "'JetBrains Mono', monospace" }}
          >
            <span style={{ color: "var(--text-muted)" }}>Last enrichment: </span>
            <span style={{ color: latestEnrich.status === "completed" ? "#10b981" : latestEnrich.status === "failed" ? "#ef4444" : "#f59e0b" }}>
              {latestEnrich.status}
            </span>
            {latestEnrich.progress_total > 0 && (
              <span style={{ color: "var(--text-muted)" }}> ({latestEnrich.progress_done}/{latestEnrich.progress_total})</span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
