import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { useJobs } from "@/hooks/useJobs";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        <div className="text-xs leading-relaxed text-muted-foreground">
          Use local LLM to generate descriptions, classifications, and embeddings for graph nodes.
        </div>

        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Repository
          </Label>
          <Input
            type="text"
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="w-full font-mono text-xs"
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Limit
            </Label>
            <Input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Mode
            </Label>
            <Button
              variant={unenrichedOnly ? "secondary" : "outline"}
              size="sm"
              className="w-full justify-start text-[11px]"
              onClick={() => setUnenrichedOnly(!unenrichedOnly)}
            >
              {unenrichedOnly ? "Unenriched only" : "All nodes"}
            </Button>
          </div>
        </div>

        <Button
          onClick={handleEnrich}
          disabled={!repoUrl.trim() || isRunning}
          className="w-full"
        >
          {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Run Enrichment
        </Button>

        {latestEnrich && (
          <div className="rounded-md border bg-muted/50 px-4 py-3 text-[11px] font-mono">
            <span className="text-muted-foreground">Last enrichment: </span>
            <span className={
              latestEnrich.status === "completed" ? "text-green-500"
              : latestEnrich.status === "failed" ? "text-red-500"
              : "text-yellow-500"
            }>
              {latestEnrich.status}
            </span>
            {latestEnrich.progress_total > 0 && (
              <span className="text-muted-foreground"> ({latestEnrich.progress_done}/{latestEnrich.progress_total})</span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
