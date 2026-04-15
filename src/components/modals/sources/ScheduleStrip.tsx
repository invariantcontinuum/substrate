// frontend/src/components/modals/sources/ScheduleStrip.tsx
import { useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSchedules } from "@/hooks/useSchedules";
import { SchedulePopover } from "./SchedulePopover";

interface Props {
  sourceId: string;
}

export function ScheduleStrip({ sourceId }: Props) {
  const { schedules } = useSchedules();
  const [open, setOpen] = useState(false);
  const mine = schedules.filter((s) => s.source_id === sourceId);

  return (
    <div className="schedule-strip">
      {mine.length === 0 ? (
        <>
          <span className="muted">No schedule</span>
          <Button onClick={() => setOpen(true)}>
            <Clock size={12} /> + Schedule
          </Button>
        </>
      ) : (
        <>
          <span>Every {mine[0].interval_minutes}m{mine[0].enabled ? "" : " (disabled)"}</span>
          <Button onClick={() => setOpen(true)}>Manage</Button>
        </>
      )}
      {open && <SchedulePopover sourceId={sourceId} onClose={() => setOpen(false)} />}
    </div>
  );
}
