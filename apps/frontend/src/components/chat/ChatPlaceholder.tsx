import { Link } from "react-router-dom";
import { useChatStore } from "@/stores/chat";
import { useChatContextStore } from "@/stores/chatContext";
import { useSources } from "@/hooks/useSources";

const EXAMPLE_PROMPTS = [
  "What are the largest communities?",
  "Which files import X?",
  "Summarize the auth subsystem.",
];

export function ChatPlaceholder() {
  const setDraft = useChatStore((s) => s.setComposerDraft);
  const active = useChatContextStore((s) => s.active);
  const { sources } = useSources();
  const ctxSource = active ? sources?.find((s) => s.id === active.source_id) : null;

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
          {active && ctxSource
            ? <>This thread will use the active context: <strong>{ctxSource.owner}/{ctxSource.name}</strong>.</>
            : <>No chat context applied. <Link to="/sources/config">Set one up</Link>.</>
          }
        </p>
      </div>
    </div>
  );
}
