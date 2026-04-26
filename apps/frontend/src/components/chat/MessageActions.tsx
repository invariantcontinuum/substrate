import { Pencil, RotateCw } from "lucide-react";

/**
 * Hover-revealed inline action bar for chat messages. Only rendered for
 * user-role messages — assistant turns can't be edited or regenerated
 * directly (regenerate from the assistant bubble actually targets the
 * preceding user turn, but the affordance lives on the user bubble per
 * Phase 7's UX choice to keep "edit + re-roll" controls grouped on the
 * row that owns the prompt).
 *
 * Visibility is driven by the parent ``.message:hover`` selector in
 * globals.css — keeping the pattern in CSS lets keyboard users still
 * see the buttons via :focus-within without JS state.
 */
export function MessageActions({
  isUser,
  onEdit,
  onRegenerate,
}: {
  isUser: boolean;
  onEdit: () => void;
  onRegenerate: () => void;
}) {
  if (!isUser) return null;
  return (
    <div className="message-actions" aria-label="Message actions">
      <button
        type="button"
        onClick={onEdit}
        title="Edit and resend"
        aria-label="Edit and resend"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={onRegenerate}
        title="Regenerate reply"
        aria-label="Regenerate reply"
      >
        <RotateCw size={14} />
      </button>
    </div>
  );
}
