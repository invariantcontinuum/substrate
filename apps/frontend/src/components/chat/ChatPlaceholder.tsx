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
  const srcCount = active?.source_ids?.length ?? 0;
  const hasScope = snapCount + srcCount > 0;

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
          {hasScope
            ? <>This thread will use the active context: <strong>{describeScope(snapCount, srcCount)}</strong>.</>
            : <>No chat context applied. <Link to="/account/chat-context">Set one up</Link>.</>
          }
        </p>
      </div>
    </div>
  );
}

function describeScope(snap: number, src: number): string {
  const parts: string[] = [];
  if (snap > 0) parts.push(`${snap} snapshot${snap === 1 ? "" : "s"}`);
  if (src > 0) parts.push(`${src} source${src === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
