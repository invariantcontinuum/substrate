import { Link } from "react-router-dom";
import { useChatStore } from "@/stores/chat";
import { useChatContextStore } from "@/stores/chatContext";

const EXAMPLE_PROMPTS = [
  "What are the largest communities?",
  "Which files import X?",
  "Summarize the auth subsystem.",
];

export function ChatPlaceholder() {
  const setDraft = useChatStore((s) => s.setComposerDraft);
  const active = useChatContextStore((s) => s.active);
  const snapCount = active?.sync_ids?.length ?? 0;

  return (
    <div className="chat-placeholder">
      <div className="chat-placeholder-card">
        <h2>Ask anything about your graph</h2>
        <p className="muted">Pick a prompt or type your own.</p>
        <ul className="chat-placeholder-prompts">
          {EXAMPLE_PROMPTS.map((p) => (
            <li key={p}>
              <button type="button" onClick={() => setDraft(p)}>{p}</button>
            </li>
          ))}
        </ul>
        <p className="chat-placeholder-context muted">
          {snapCount > 0
            ? <>This thread will use the active context: <strong>{snapCount} snapshot{snapCount === 1 ? "" : "s"}</strong>.</>
            : <>No chat context applied. <Link to="/account/chat-context">Set one up</Link>.</>
          }
        </p>
      </div>
    </div>
  );
}
