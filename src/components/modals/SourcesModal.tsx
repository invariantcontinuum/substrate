import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { RefreshCw, Loader2, Trash2, Clock, Power } from "lucide-react";
import { useGraphStore } from "@/stores/graph";
import { useSources } from "@/hooks/useSources";
import { useSyncs } from "@/hooks/useSyncs";
import { useSchedules } from "@/hooks/useSchedules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

const SCHEDULE_OPTIONS = [
  { label: "5 min", value: 5 }, { label: "15 min", value: 15 },
  { label: "30 min", value: 30 }, { label: "1 hour", value: 60 },
  { label: "6 hours", value: 360 }, { label: "24 hours", value: 1440 },
];

function parseRepoUrl(url: string): { owner: string; name: string } | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length >= 2) return { owner: parts[0], name: parts[1].replace(/\.git$/, "") };
  } catch { /* ignore */ }
  return null;
}

export function SourcesModal() {
  const { activeModal, closeModal } = useUIStore();
  const defaultRepoUrl = useUIStore((s) => s.defaultRepoUrl);
  const { sources, createSource } = useSources();
  const { startSync, activeSyncs } = useSyncs();
  const { schedules, createSchedule, toggleSchedule, deleteSchedule } = useSchedules();
  const setLayout = useGraphStore((s) => s.setLayout);

  const [repoUrl, setRepoUrl] = useState(defaultRepoUrl ?? "");
  const [scheduleInterval, setScheduleInterval] = useState(60);

  useEffect(() => { if (defaultRepoUrl) setRepoUrl(defaultRepoUrl); }, [defaultRepoUrl]);

  const syncing = activeSyncs.length > 0;

  const ensureSource = async (): Promise<string | null> => {
    const url = repoUrl.trim();
    const parsed = parseRepoUrl(url);
    if (!parsed) return null;
    const existing = sources.find((s) =>
      s.source_type === "github_repo" && s.owner === parsed.owner && s.name === parsed.name);
    if (existing) return existing.id;
    const created = await createSource({
      source_type: "github_repo", owner: parsed.owner, name: parsed.name, url,
    });
    return created.id;
  };

  const handleSync = async () => {
    const sid = await ensureSource();
    if (!sid) return;
    await startSync({ source_id: sid });
  };

  const handleSchedule = async () => {
    const sid = await ensureSource();
    if (!sid) return;
    await createSchedule({ source_id: sid, interval_minutes: scheduleInterval });
  };

  const sourceLabel = (sid: string) => {
    const s = sources.find((x) => x.id === sid);
    return s ? `${s.owner}/${s.name}` : sid.slice(0, 8);
  };

  return (
    <Modal open={activeModal === "sources"} onClose={closeModal} title="Sources" size="md">
      <div className="sources-modal">
        <div>
          <Label>Ingest Repository</Label>
          <div className="sources-modal-row">
            <Input type="text" placeholder="https://github.com/owner/repo"
              value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSync()} />
            <Button onClick={handleSync} disabled={!repoUrl.trim() || syncing}>
              {syncing ? <Loader2 size={14} /> : <RefreshCw size={14} />}
              Sync
            </Button>
          </div>
        </div>

        <div>
          <Label>Schedule Sync</Label>
          <div className="sources-modal-row">
            <Select value={String(scheduleInterval)}
              onValueChange={(v: string | null) => v && setScheduleInterval(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCHEDULE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>Every {o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleSchedule} disabled={!repoUrl.trim()}>
              <Clock size={14} /> Set Schedule
            </Button>
          </div>
        </div>

        {schedules.length > 0 && (
          <div>
            <Label>Active Schedules</Label>
            <div className="sources-schedules">
              {schedules.map((s) => (
                <div key={s.id} className="sources-schedule-item">
                  <div>
                    <span>{sourceLabel(s.source_id)}</span>
                    <span> / {s.interval_minutes}m</span>
                  </div>
                  <div className="sources-schedule-actions">
                    <Button onClick={() => toggleSchedule(s)}><Power size={12} /></Button>
                    <Button onClick={() => deleteSchedule(s.id)}><Trash2 size={12} /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label>View</Label>
          <div className="sources-view">
            <div className="sources-view-row">
              {([["force", "Force"], ["hierarchical", "Hierarchy"]] as const).map(([val, label]) => (
                <Button key={val} onClick={() => setLayout(val)}>{label}</Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
