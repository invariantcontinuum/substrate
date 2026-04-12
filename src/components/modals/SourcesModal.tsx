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

  const [repoUrl, setRepoUrl] = useState(defaultRepoUrl ?? "");
  const [scheduleInterval, setScheduleInterval] = useState(60);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);

  useEffect(() => {
    if (defaultRepoUrl) {
      setRepoUrl(defaultRepoUrl);
    }
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

  const handlePurge = () => {
    purgeGraph();
    setShowPurgeConfirm(false);
  };

  const handleClean = () => {
    setCanvasCleared(true);
  };

  return (
    <Modal open={activeModal === "sources"} onClose={closeModal} title="Sources" maxWidth={520}>
      <div className="flex flex-col gap-5">
        {/* Ingest repo */}
        <div>
          <div className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: "var(--text-muted)" }}>
            Ingest Repository
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSync()}
              className="flex-1 text-[11px] px-3 py-2 rounded-lg outline-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--text-primary)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            <button
              onClick={handleSync}
              disabled={!repoUrl.trim() || syncing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors"
              style={{
                background: "rgba(99,102,241,0.1)",
                border: "1px solid rgba(99,102,241,0.2)",
                color: "#a5b4fc",
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
          <div className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: "var(--text-muted)" }}>
            Schedule Sync
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={scheduleInterval}
              onChange={(e) => setScheduleInterval(Number(e.target.value))}
              className="text-[11px] px-2 py-2 rounded-lg outline-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--text-secondary)",
              }}
            >
              {SCHEDULE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} style={{ background: "#0d0d12" }}>
                  Every {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleSchedule}
              disabled={!repoUrl.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
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
            <div className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: "var(--text-muted)" }}>
              Active Schedules
            </div>
            <div className="flex flex-col gap-1.5">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-[11px]"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <div style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <span style={{ color: "var(--text-primary)" }}>{s.owner}/{s.repo}</span>
                    <span style={{ color: "var(--text-muted)" }}> / {s.job_type} / {s.interval_minutes}m</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => toggleSchedule(s.id)} title={s.enabled ? "Disable" : "Enable"}>
                      <Power size={12} style={{ color: s.enabled ? "#10b981" : "#ef4444" }} />
                    </button>
                    <button onClick={() => deleteSchedule(s.id)} title="Delete">
                      <Trash2 size={12} style={{ color: "var(--text-muted)" }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* View controls */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 16 }}>
          <div className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: "var(--text-muted)" }}>
            View
          </div>
          <button
            onClick={handleClean}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-secondary)",
            }}
          >
            <Trash2 size={13} />
            Clean Canvas
          </button>
        </div>

        {/* Danger zone */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 16 }}>
          <div className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: "#ef4444" }}>
            Danger Zone
          </div>
          {!showPurgeConfirm ? (
            <button
              onClick={() => setShowPurgeConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium"
              style={{ background: "rgba(239,68,68,0.06)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.12)" }}
            >
              <Trash2 size={13} />
              Purge All Graph Data
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handlePurge}
                className="px-3 py-2 rounded-lg text-[11px] font-medium"
                style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
              >
                Confirm Purge
              </button>
              <button
                onClick={() => setShowPurgeConfirm(false)}
                className="px-3 py-2 rounded-lg text-[11px]"
                style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.06)" }}
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
