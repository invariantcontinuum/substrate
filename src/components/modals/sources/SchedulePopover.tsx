// frontend/src/components/modals/sources/SchedulePopover.tsx
import { useState } from "react";
import { Trash2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useSchedules, type Schedule } from "@/hooks/useSchedules";

const INTERVAL_OPTIONS = [
  { label: "5 min", value: 5 }, { label: "15 min", value: 15 },
  { label: "30 min", value: 30 }, { label: "1 hour", value: 60 },
  { label: "6 hours", value: 360 }, { label: "24 hours", value: 1440 },
];

interface Props {
  sourceId: string;
  onClose: () => void;
}

export function SchedulePopover({ sourceId, onClose }: Props) {
  const { schedules, createSchedule, toggleSchedule, deleteSchedule } = useSchedules();
  const mine = schedules.filter((s) => s.source_id === sourceId);
  const [interval, setInterval] = useState(mine[0]?.interval_minutes ?? 60);

  const create = async () => {
    await createSchedule({ source_id: sourceId, interval_minutes: interval });
    onClose();
  };

  return (
    <div className="schedule-popover" role="dialog" aria-label="Schedule sync">
      <div className="schedule-popover-row">
        <Label>Interval</Label>
        <Select value={String(interval)} onValueChange={(v) => v && setInterval(Number(v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {INTERVAL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>Every {o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {mine.length === 0 ? (
        <Button onClick={create}>Create schedule</Button>
      ) : (
        <>
          <div className="schedule-popover-active-label">Active schedules</div>
          {mine.map((s: Schedule) => (
            <div key={s.id} className="schedule-popover-row">
              <span>Every {s.interval_minutes}m · {s.enabled ? "on" : "off"}</span>
              <div className="schedule-popover-actions">
                <Button onClick={() => toggleSchedule(s)} title={s.enabled ? "Disable" : "Enable"}>
                  <Power size={12} />
                </Button>
                <Button onClick={() => deleteSchedule(s.id)} title="Delete">
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>
          ))}
          <Button onClick={create}>Add another</Button>
        </>
      )}
      <div className="schedule-popover-footer">
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
