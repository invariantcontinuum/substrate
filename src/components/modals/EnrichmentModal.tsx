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
      <div className="flex flex-col gap-4">
        <p>Use local LLM to generate descriptions, classifications, and embeddings for graph nodes.</p>

        <div>
          <Label className="block mb-2">Repository</Label>
          <Input
            type="text"
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <Label className="block mb-2">Limit</Label>
            <Input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
          </div>
          <div className="flex-1">
            <Label className="block mb-2">Mode</Label>
            <Button onClick={() => setUnenrichedOnly(!unenrichedOnly)} className="w-full justify-start">
              {unenrichedOnly ? "Unenriched only" : "All nodes"}
            </Button>
          </div>
        </div>

        <Button onClick={handleEnrich} disabled={!repoUrl.trim() || isRunning} className="w-full">
          {isRunning ? <Loader2 size={14} /> : <Sparkles size={14} />}
          Run Enrichment
        </Button>

        {latestEnrich && (
          <div className="border border-black p-2">
            <span>Last enrichment: </span>
            <span>{latestEnrich.status}</span>
            {latestEnrich.progress_total > 0 && (
              <span> ({latestEnrich.progress_done}/{latestEnrich.progress_total})</span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
