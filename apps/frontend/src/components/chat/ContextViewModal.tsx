import { Modal } from "@/components/ui/Modal";
import type { MessageContext } from "@/hooks/useMessageContext";

/**
 * Read-only inspector for what was sent to the LLM on a given assistant
 * turn. Three collapsible sections:
 *
 * - System prompt — frozen at request time, drawn from the
 *   ``chat_message_context.system_prompt`` snapshot.
 * - History — every prior message used to compose this turn.
 * - Files in scope — descriptions and metadata only; full content lives
 *   behind the FileModal (clicking an evidence chip opens that route).
 *
 * The ``<details>`` elements render as native disclosures so keyboard
 * users can collapse the long history without any JS state. The system
 * prompt is opened by default since it's the smallest section.
 */
export function ContextViewModal({
  open,
  onClose,
  context,
}: {
  open: boolean;
  onClose: () => void;
  context: MessageContext;
}) {
  if (!open) return null;
  // The JSONB ``history`` column can come back as `null`, `{}`, or an
  // array depending on which migration version produced the row. Coerce
  // to an array up-front so the renderer never crashes; same for
  // ``files`` since the backend recently widened the wire shape and old
  // rows may carry the empty-object default.
  const history = Array.isArray(context.history) ? context.history : [];
  const files = Array.isArray(context.files) ? context.files : [];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Chat context (read-only)"
      size="lg"
    >
      <details open className="context-section">
        <summary>System prompt</summary>
        <pre className="context-pre">{context.system_prompt || "(empty)"}</pre>
      </details>
      <details className="context-section">
        <summary>History ({history.length} messages)</summary>
        {history.length === 0 && (
          <p className="muted">No prior messages.</p>
        )}
        {history.map((h, i) => (
          // Order is stable for the lifetime of this snapshot — the
          // chat_message_context row is immutable once persisted — so
          // the index makes a safe key without needing a synthetic id.
          <article key={`${i}-${h.role}`} className="context-history-item">
            <header>
              <strong>{h.role}</strong>
            </header>
            <pre className="context-pre">{h.content}</pre>
          </article>
        ))}
      </details>
      <details className="context-section">
        <summary>Files in scope ({files.length})</summary>
        {files.length === 0 ? (
          <p className="muted">No files attached to this turn.</p>
        ) : (
          <ul className="context-files">
            {files.map((f, idx) => (
              <li key={f.file_id ?? `${idx}-${f.filepath ?? ""}`}>
                <strong>{f.filepath || "(unknown path)"}</strong>
                <span className="muted">
                  {" "}
                  ({f.language || "plain"}
                  {typeof f.size_bytes === "number"
                    ? `, ${(f.size_bytes / 1024).toFixed(1)} KB`
                    : ""}
                  )
                </span>
                <p>{f.description || "(no description)"}</p>
              </li>
            ))}
          </ul>
        )}
      </details>
    </Modal>
  );
}
