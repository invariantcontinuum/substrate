import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import type { ChatMessage } from "@/hooks/useChatMessages";
import { useEditMessage, useRegenerateMessage } from "@/hooks/useChatMessage";
import { Citations } from "./Citations";
import { CodeBlock } from "./CodeBlock";
import { MessageActions } from "./MessageActions";
import { MessageFooter } from "./MessageFooter";

const markdownComponents: Components = {
  code({ className, children, node, ...props }) {
    const isBlock = node?.position
      ? (node.position.start.line !== node.position.end.line)
      : false;
    const langMatch = /language-(\w+)/.exec(className ?? "");
    const code = String(children ?? "").replace(/\n$/, "");
    if (isBlock) {
      return <CodeBlock code={code} language={langMatch?.[1] ?? "text"} />;
    }
    return <code className={className} {...props}>{children}</code>;
  },
};

/**
 * Single chat-row renderer. Three orthogonal slots compose into one
 * layout:
 *
 * - Header: hover-revealed MessageActions for user turns (edit /
 *   regenerate). The `.message:hover` selector in globals.css drives
 *   visibility so keyboard focus also reveals the controls without
 *   bespoke JS state.
 * - Body: either the user's plaintext, the inline edit textarea (when
 *   ``editing`` is true), or markdown-rendered assistant content.
 *   The streaming caret is appended to assistant text while
 *   ``isStreaming`` — assistants don't get an edit affordance because
 *   the message id isn't durable until the turn lands in the DB.
 * - Footer: numeric stats + inspector modals + evidence chips for
 *   completed assistant turns. Hidden during streaming and for any
 *   message whose id starts with ``optimistic-`` (the synthesised id
 *   used by ``useSendTurn`` while waiting on the 202 response).
 *
 * The ``muted`` prop is set by the parent disclosure in
 * MessageList — superseded rows render at reduced opacity to make it
 * obvious they aren't part of the active conversation any longer.
 */
export function Message({
  message,
  isStreaming,
  muted,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
  muted?: boolean;
}) {
  const isUser = message.role === "user";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const editMutation = useEditMessage();
  const regenMutation = useRegenerateMessage();
  const isOptimistic = message.id.startsWith("optimistic-");

  const onEdit = () => {
    setDraft(message.content);
    setEditing(true);
  };
  const onCancelEdit = () => {
    setDraft(message.content);
    setEditing(false);
  };
  const onSaveEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === message.content || isOptimistic) {
      onCancelEdit();
      return;
    }
    editMutation.mutate({ message_id: message.id, content: trimmed });
    setEditing(false);
  };
  const onRegenerate = () => {
    if (isOptimistic) return;
    regenMutation.mutate({ message_id: message.id });
  };

  return (
    <div
      className={`message ${isUser ? "is-user" : "is-assistant"}`}
      data-muted={muted ? "true" : undefined}
    >
      {!editing && !isStreaming && !isOptimistic && (
        <MessageActions
          isUser={isUser}
          onEdit={onEdit}
          onRegenerate={onRegenerate}
        />
      )}
      <div className="message-content">
        {editing && isUser ? (
          <div className="message-edit">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <div className="actions">
              <button
                type="button"
                className="message-edit-save"
                onClick={onSaveEdit}
                disabled={editMutation.isPending}
              >
                Save
              </button>
              <button
                type="button"
                className="message-edit-cancel"
                onClick={onCancelEdit}
                disabled={editMutation.isPending}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : isUser ? (
          message.content
        ) : (
          <ReactMarkdown components={markdownComponents}>
            {message.content}
          </ReactMarkdown>
        )}
        {isStreaming && <span className="message-cursor">▍</span>}
      </div>
      {!isUser && message.citations && message.citations.length > 0 && (
        <Citations items={message.citations} />
      )}
      {!isUser && !isStreaming && !isOptimistic && (
        <MessageFooter messageId={message.id} />
      )}
    </div>
  );
}
