import { useState } from "react";
import { useMessageContext } from "@/hooks/useMessageContext";
import { useMessageEvidence } from "@/hooks/useMessageEvidence";
import { ContextViewModal } from "./ContextViewModal";
import { SystemPromptModal } from "./SystemPromptModal";
import { EvidenceChip } from "./EvidenceChip";

/**
 * Footer rendered under each completed assistant turn. Shows three
 * numeric stats (input tokens, output tokens, wall-clock duration), two
 * inspector buttons (View context / System prompt), and a flow of
 * EvidenceChip pills for any cite_evidence rows associated with the
 * turn.
 *
 * The component is purely additive — when no chat_message_context row
 * exists yet (turn still mid-stream, or persistence raced) it renders
 * nothing rather than a partial scaffold. Once context lands the footer
 * settles in and never re-renders for the same message id since both
 * queries are highly cacheable.
 */
export function MessageFooter({ messageId }: { messageId: string }) {
  const [contextOpen, setContextOpen] = useState(false);
  const [sysOpen, setSysOpen] = useState(false);
  const ctx = useMessageContext(messageId);
  const { evidence } = useMessageEvidence(messageId);
  const context = ctx.data;
  if (!context) return null;

  return (
    <footer className="message-footer">
      <span className="message-footer-stat" title="Input tokens">
        ↓ {context.tokens_in.toLocaleString()} tokens
      </span>
      <span className="message-footer-stat" title="Output tokens">
        ↑ {context.tokens_out.toLocaleString()} tokens
      </span>
      <span className="message-footer-stat" title="Wall-clock duration">
        ⏱ {context.duration_ms.toLocaleString()}ms
      </span>
      <button
        type="button"
        className="message-footer-btn"
        onClick={() => setContextOpen(true)}
      >
        View context
      </button>
      <button
        type="button"
        className="message-footer-btn"
        onClick={() => setSysOpen(true)}
      >
        System prompt
      </button>

      {evidence.length > 0 && (
        <div className="evidence-row">
          {evidence.map((ev) => (
            <EvidenceChip
              key={`${ev.id}:${ev.filepath}:${ev.start_line}-${ev.end_line}`}
              ev={ev}
            />
          ))}
        </div>
      )}

      <ContextViewModal
        open={contextOpen}
        onClose={() => setContextOpen(false)}
        context={context}
      />
      <SystemPromptModal
        open={sysOpen}
        onClose={() => setSysOpen(false)}
        systemPrompt={context.system_prompt}
      />
    </footer>
  );
}
