import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { useJobs } from "@/hooks/useJobs";
import { RefreshCw, Loader2, Trash2, Clock, Power } from "lucide-react";
import { useGraphStore } from "@/stores/graph";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

const SCHEDULE_OPTIONS = [
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "6 hours", value: 360 },
  { label: "24 hours", value: 1440 },
];

export function SourcesModal() {
  const { activeModal, closeModal } = useUIStore();
  const defaultRepoUrl = useUIStore((s) => s.defaultRepoUrl);
  const { runJob, isRunning, schedules, createSchedule, toggleSchedule, deleteSchedule, purgeGraph } = useJobs();
  const setCanvasCleared = useGraphStore((s) => s.setCanvasCleared);
  const syncStatus = useGraphStore((s) => s.syncStatus);
  const layout = useGraphStore((s) => s.layout);
  const setLayout = useGraphStore((s) => s.setLayout);

  const [repoUrl, setRepoUrl] = useState(defaultRepoUrl ?? "");
  const [scheduleInterval, setScheduleInterval] = useState(60);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);

  useEffect(() => {
    if (defaultRepoUrl) setRepoUrl(defaultRepoUrl);
  }, [defaultRepoUrl]);

  const syncing = isRunning || syncStatus === "syncing";

  const handleSync = () => {
    if (!repoUrl.trim()) return;
    runJob({ jobType: "sync", scope: { repo_url: repoUrl.trim() } });
  };

  const handleSchedule = () => {
    if (!repoUrl.trim()) return;
    createSchedule("sync", repoUrl.trim(), scheduleInterval);
  };

  return (
    <Modal open={activeModal === "sources"} onClose={closeModal} title="Sources" maxWidth={520}>
      <div className="flex flex-col gap-5">
        {/* Ingest repo */}
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-display">
            Ingest Repository
          </Label>
          <div className="flex gap-3">
            <Input
              type="text"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSync()}
              className="flex-1 font-mono text-xs"
            />
            <Button
              size="sm"
              onClick={handleSync}
              disabled={!repoUrl.trim() || syncing}
            >
              {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Sync
            </Button>
          </div>
        </div>

        {/* Schedule */}
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-display">
            Schedule Sync
          </Label>
          <div className="flex gap-3 items-center">
            <Select value={String(scheduleInterval)} onValueChange={(v: string | null) => v && setScheduleInterval(Number(v))}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    Every {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSchedule}
              disabled={!repoUrl.trim()}
            >
              <Clock size={13} />
              Set Schedule
            </Button>
          </div>
        </div>

        {/* Active schedules */}
        {schedules.length > 0 && (
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-display">
              Active Schedules
            </Label>
            <div className="flex flex-col gap-2">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border bg-muted/50 px-4 py-3 text-[11px]"
                >
                  <div className="font-mono">
                    <span className="text-foreground">{s.owner}/{s.repo}</span>
                    <span className="text-muted-foreground"> / {s.job_type} / {s.interval_minutes}m</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => toggleSchedule(s.id)}
                      title={s.enabled ? "Disable" : "Enable"}
                    >
                      <Power size={12} className={s.enabled ? "text-green-500" : "text-red-500"} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => deleteSchedule(s.id)}
                      title="Delete"
                    >
                      <Trash2 size={12} className="text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* View controls */}
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-display">
            View
          </Label>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              {([["force", "Force"], ["hierarchical", "Hierarchy"]] as const).map(([val, label]) => {
                const active = layout === val;
                return (
                  <Button
                    key={val}
                    variant={active ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setLayout(val as "force" | "hierarchical")}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCanvasCleared(true)}
            >
              <Trash2 size={13} />
              Clean Canvas
            </Button>
          </div>
        </div>

        {/* Danger zone */}
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-destructive mb-2.5 font-display">
            Danger Zone
          </Label>
          {!showPurgeConfirm ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowPurgeConfirm(true)}
            >
              <Trash2 size={13} />
              Purge All Graph Data
            </Button>
          ) : (
            <div className="flex gap-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { purgeGraph(); setShowPurgeConfirm(false); }}
              >
                Confirm Purge
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPurgeConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
