import { useChatStore } from "@/stores/chat";

const EXAMPLE_PROMPTS = [
  "What are the largest communities?",
  "Which files import X?",
  "Summarize the auth subsystem.",
];

export function ChatPlaceholder() {
  const setDraft = useChatStore((s) => s.setComposerDraft);

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
      </div>
    </div>
  );
}
