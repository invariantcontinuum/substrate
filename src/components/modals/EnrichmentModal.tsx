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
      <div className="flex flex-col gap-7">
        <div className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Use local LLM to generate descriptions, classifications, and embeddings for graph nodes.
        </div>

        <div>
          <div className="section-label" style={{ fontFamily: "var(--font-display)" }}>
            Repository
          </div>
          <input
            type="text"
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="glass-input w-full"
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <div className="section-label" style={{ fontFamily: "var(--font-display)" }}>
              Limit
            </div>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="glass-input w-full"
            />
          </div>
          <div className="flex-1">
            <div className="section-label" style={{ fontFamily: "var(--font-display)" }}>
              Mode
            </div>
            <button
              onClick={() => setUnenrichedOnly(!unenrichedOnly)}
              className="w-full text-[11px] px-4 py-3 text-left"
              style={{
                background: unenrichedOnly ? "var(--accent-soft)" : "var(--bg-hover)",
                border: unenrichedOnly ? "1px solid var(--accent-medium)" : "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                color: unenrichedOnly ? "var(--accent)" : "var(--text-muted)",
                transition: "all 0.15s ease",
              }}
            >
              {unenrichedOnly ? "Unenriched only" : "All nodes"}
            </button>
          </div>
        </div>

        <button
          onClick={handleEnrich}
          disabled={!repoUrl.trim() || isRunning}
          className="glass-btn-accent flex items-center justify-center gap-2"
        >
          {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Run Enrichment
        </button>

        {latestEnrich && (
          <div
            className="px-4 py-3 text-[11px]"
            style={{
              background: "var(--bg-hover)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)", fontFamily: "var(--font-mono)",
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>Last enrichment: </span>
            <span style={{ color: latestEnrich.status === "completed" ? "var(--success)" : latestEnrich.status === "failed" ? "var(--error)" : "var(--warning)" }}>
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
