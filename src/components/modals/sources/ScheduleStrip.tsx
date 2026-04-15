// frontend/src/components/modals/sources/ScheduleStrip.tsx
import { Clock } from "lucide-react";
import { useSchedules } from "@/hooks/useSchedules";

interface Props { sourceId: string; }

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
  return (
    <div className="schedule-strip">
      <Clock size={12} />
      Every {mine[0].interval_minutes}m{mine[0].enabled ? "" : " (disabled)"}
    </div>
  );
}
