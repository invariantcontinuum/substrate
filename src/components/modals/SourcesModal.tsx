import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { useJobs } from "@/hooks/useJobs";
import { RefreshCw, Loader2, Trash2, Clock, Power } from "lucide-react";
import { useGraphStore } from "@/stores/graph";

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
      <div className="flex flex-col gap-7">
        {/* Ingest repo */}
        <div>
          <div className="text-[10px] uppercase tracking-wider mb-3 font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
            Ingest Repository
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSync()}
              className="flex-1 text-[11px] px-4 py-3 outline-none"
              style={{
                background: "var(--bg-surface)",
                boxShadow: "var(--neu-inset)",
                borderRadius: "var(--radius-lg)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                border: "none",
              }}
            />
            <button
              onClick={handleSync}
              disabled={!repoUrl.trim() || syncing}
              className="neu-btn flex items-center gap-1.5 px-4 py-3 text-[11px] font-semibold"
              style={{
                background: "var(--accent)",
                borderRadius: "var(--radius-lg)",
                color: "#fff",
                opacity: !repoUrl.trim() || syncing ? 0.4 : 1,
              }}
            >
              {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Sync
            </button>
          </div>
        </div>

        {/* Schedule */}
        <div>
          <div className="text-[10px] uppercase tracking-wider mb-3 font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
            Schedule Sync
          </div>
          <div className="flex gap-3 items-center">
            <select
              value={scheduleInterval}
              onChange={(e) => setScheduleInterval(Number(e.target.value))}
              className="text-[11px] px-3 py-3 outline-none"
              style={{
                background: "var(--bg-surface)",
                boxShadow: "var(--neu-inset)",
                borderRadius: "var(--radius-lg)",
                color: "var(--text-secondary)",
                border: "none",
              }}
            >
              {SCHEDULE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} style={{ background: "var(--bg-elevated)" }}>
                  Every {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleSchedule}
              disabled={!repoUrl.trim()}
              className="neu-btn flex items-center gap-1.5 px-4 py-3 text-[11px] font-medium"
              style={{
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-lg)",
                color: "var(--text-secondary)",
                opacity: !repoUrl.trim() ? 0.4 : 1,
              }}
            >
              <Clock size={13} />
              Set Schedule
            </button>
          </div>
        </div>

        {/* Active schedules */}
        {schedules.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-3 font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
              Active Schedules
            </div>
            <div className="flex flex-col gap-2">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-4 py-3 text-[11px]"
                  style={{ background: "var(--bg-surface)", boxShadow: "var(--neu-extruded-sm)", borderRadius: "var(--radius-lg)" }}
                >
                  <div style={{ fontFamily: "var(--font-mono)" }}>
                    <span style={{ color: "var(--text-primary)" }}>{s.owner}/{s.repo}</span>
                    <span style={{ color: "var(--text-muted)" }}> / {s.job_type} / {s.interval_minutes}m</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleSchedule(s.id)}
                      title={s.enabled ? "Disable" : "Enable"}
                      className="neu-btn flex items-center justify-center w-7 h-7"
                      style={{ borderRadius: "var(--radius-sm)", background: "var(--bg-surface)" }}
                    >
                      <Power size={12} style={{ color: s.enabled ? "var(--success)" : "var(--error)" }} />
                    </button>
                    <button
                      onClick={() => deleteSchedule(s.id)}
                      title="Delete"
                      className="neu-btn flex items-center justify-center w-7 h-7"
                      style={{ borderRadius: "var(--radius-sm)", background: "var(--bg-surface)" }}
                    >
                      <Trash2 size={12} style={{ color: "var(--text-muted)" }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* View controls */}
        <div>
          <div className="text-[10px] uppercase tracking-wider mb-3 font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
            View
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              {([["force", "Force"], ["hierarchical", "Hierarchy"]] as const).map(([val, label]) => {
                const active = layout === val;
                return (
                  <button
                    key={val}
                    onClick={() => setLayout(val as "force" | "hierarchical")}
                    className="px-5 py-3 text-[11px] font-medium"
                    style={{
                      background: "var(--bg-surface)",
                      borderRadius: "var(--radius-lg)",
                      boxShadow: active ? "var(--neu-inset)" : "var(--neu-extruded-sm)",
                      color: active ? "var(--accent)" : "var(--text-muted)",
                      transition: "all 0.3s ease-out",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCanvasCleared(true)}
              className="neu-btn flex items-center gap-1.5 px-4 py-3 text-[11px] font-medium"
              style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", color: "var(--text-secondary)" }}
            >
              <Trash2 size={13} />
              Clean Canvas
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div>
          <div className="text-[10px] uppercase tracking-wider mb-3 font-semibold" style={{ color: "var(--error)", fontFamily: "var(--font-display)" }}>
            Danger Zone
          </div>
          {!showPurgeConfirm ? (
            <button
              onClick={() => setShowPurgeConfirm(true)}
              className="neu-btn flex items-center gap-1.5 px-4 py-3 text-[11px] font-medium"
              style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", color: "var(--error)" }}
            >
              <Trash2 size={13} />
              Purge All Graph Data
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => { purgeGraph(); setShowPurgeConfirm(false); }}
                className="px-4 py-3 text-[11px] font-semibold"
                style={{ background: "var(--error)", borderRadius: "var(--radius-lg)", color: "#fff", boxShadow: "var(--neu-extruded-sm)" }}
              >
                Confirm Purge
              </button>
              <button
                onClick={() => setShowPurgeConfirm(false)}
                className="neu-btn px-4 py-3 text-[11px]"
                style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", color: "var(--text-muted)" }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
