import { SectionHeader } from "@/components/common/SectionHeader";
import { ChatContextBlock } from "@/components/sources/ChatContextBlock";
import { useEffectiveConfig, useApplyConfig } from "@/hooks/useRuntimeConfig";

interface ChatConfig {
  chat_top_k?: number;
  chat_history_turns?: number;
  chat_total_budget_chars?: number;
  chat_context_token_budget?: number;
}

export function SettingsChatContextTab() {
  const { config: chatCfg } = useEffectiveConfig<ChatConfig>("chat");
  const applyChatCfg = useApplyConfig("chat");

  return (
    <section className="settings-chat-context">
      <h3>Chat Context</h3>

      <SectionHeader title="Chat context" />
      {/*
        ChatContextBlock writes the user's active source/snapshot/community
        scope via /api/chat-context/active. The block is shared with
        SourcesConfigTab; see ChatContextBlock for selection semantics.
      */}
      <ChatContextBlock />

      <SectionHeader title="Token budget" />
      <NumKnob
        label="Top-K (file ranking)"
        value={chatCfg.chat_top_k ?? 10}
        onChange={(v) => applyChatCfg.mutate({ chat_top_k: v })}
      />
      <NumKnob
        label="History turns"
        value={chatCfg.chat_history_turns ?? 6}
        onChange={(v) => applyChatCfg.mutate({ chat_history_turns: v })}
      />
      <NumKnob
        label="Total budget chars"
        value={chatCfg.chat_total_budget_chars ?? 40000}
        onChange={(v) => applyChatCfg.mutate({ chat_total_budget_chars: v })}
      />

      <SectionHeader title="Files in scope" aux="phase 6 follow-up" />
      <div className="muted">
        Per-file checkbox selection lands once the /api/files listing endpoint
        is in (Phase 6, Task 6.6).
      </div>
    </section>
  );
}

function NumKnob({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="num-knob">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) =>
          onChange(Math.max(0, Math.round(Number(e.target.value))))
        }
      />
    </label>
  );
}
