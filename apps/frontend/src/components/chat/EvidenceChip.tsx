import { useState } from "react";
import { FileModal } from "@/components/files/FileModal";
import type { Evidence } from "@/hooks/useMessageEvidence";

/**
 * Compact pill that renders a single evidence row beneath an assistant
 * turn. The chip text shows "filepath:start-end" so users can spot the
 * cited file at a glance; the ``title`` attribute carries the model's
 * human-readable reason for the citation (the chat pipeline records
 * this in chat_message_evidence.reason).
 *
 * Clicking the chip opens a FileModal scrolled to the cited line range
 * with the matching lines highlighted, giving users a one-click verify
 * loop without leaving the chat.
 */
export function EvidenceChip({ ev }: { ev: Evidence }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="evidence-chip"
        onClick={() => setOpen(true)}
        title={ev.reason || "View cited evidence"}
      >
        <span aria-hidden="true">📎</span>{" "}
        {ev.filepath}:{ev.start_line}-{ev.end_line}
      </button>
      {open && (
        <FileModal
          open={open}
          onClose={() => setOpen(false)}
          filepath={ev.filepath}
          highlightLines={[ev.start_line, ev.end_line]}
        />
      )}
    </>
  );
}
