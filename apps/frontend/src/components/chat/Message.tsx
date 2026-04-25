import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import type { ChatMessage } from "@/hooks/useChatMessages";
import { Citations } from "./Citations";
import { CodeBlock } from "./CodeBlock";

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

export function Message({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={`message ${isUser ? "is-user" : "is-assistant"}`}>
      <div className="message-content">
        {isUser ? (
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
    </div>
  );
}
