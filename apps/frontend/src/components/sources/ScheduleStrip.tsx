// frontend/src/components/sources/ScheduleStrip.tsx
import { Clock, Settings } from "lucide-react";
import { useSchedules } from "@/hooks/useSchedules";

interface Props { sourceId: string; }

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function ScheduleStrip({ sourceId }: Props) {
  const { schedules } = useSchedules();
  const mine = schedules.filter((s) => s.source_id === sourceId);
  if (mine.length === 0) {
    return (
      <div className="schedule-strip muted">
        <Clock size={12} /> No schedule
      </div>
    );
  }
  const s = mine[0];
  const overrideCount = Object.keys(s.config_overrides ?? {}).length;
  return (
    <div className="schedule-strip">
      <Clock size={12} />
      Every {s.interval_minutes}m{s.enabled ? "" : " (disabled)"}
      {s.last_run_at && (
        <span className="schedule-strip-detail" title={s.last_run_at}>
          · Last {fmtDate(s.last_run_at)}
        </span>
      )}
      {s.next_run_at && (
        <span className="schedule-strip-detail" title={s.next_run_at}>
          · Next {fmtDate(s.next_run_at)}
        </span>
      )}
      {overrideCount > 0 && (
        <span className="schedule-strip-detail" title={JSON.stringify(s.config_overrides)}>
          <Settings size={10} /> {overrideCount} override{overrideCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
