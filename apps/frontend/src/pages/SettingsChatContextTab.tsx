import { useState } from "react";
import { SectionHeader } from "@/components/common/SectionHeader";
import { SourceSnapshotMultiSelect } from "@/components/select/SourceSnapshotMultiSelect";
import {
  useChatContext,
  useApplyChatContext,
} from "@/hooks/useChatContext";
import { useEffectiveConfig, useApplyConfig } from "@/hooks/useRuntimeConfig";

interface ChatConfig {
  chat_top_k?: number;
  chat_history_turns?: number;
  chat_total_budget_chars?: number;
  chat_context_token_budget?: number;
}

export function SettingsChatContextTab() {
  const { data: active } = useChatContext();
  // Re-mount the inner editor whenever the server-side context identity
  // changes, so the local draft re-seeds from the new server snapshot
  // without an effect-driven setState (react-hooks/set-state-in-effect).
  const seedKey = (active?.active?.sync_ids ?? []).slice().sort().join(",");
  return (
    <ChatContextEditor
      key={seedKey || "empty"}
      seed={active?.active?.sync_ids ?? []}
      seedCommunities={active?.active?.community_ids ?? []}
    />
  );
}

interface EditorProps {
  seed: string[];
  seedCommunities: { cache_key: string; community_index: number }[];
}

function ChatContextEditor({ seed, seedCommunities }: EditorProps) {
  const { config: chatCfg } = useEffectiveConfig<ChatConfig>("chat");
  const applyChatCfg = useApplyConfig("chat");
  const apply = useApplyChatContext();

  const [selectedIds, setSelectedIds] = useState<string[]>(seed);
  const dirty = !arraysEqual(selectedIds, seed);

  return (
    <section className="settings-chat-context">
      <h3>Chat Context</h3>

      <SectionHeader title="Sources & snapshots" />
      <p className="muted">
        Selected (source, snapshot) pairs are attached to every{" "}
        <strong>new</strong> chat thread you create. Existing threads keep
        their original scope.
      </p>
      <SourceSnapshotMultiSelect
        value={selectedIds}
        onChange={setSelectedIds}
        completedOnly
      />
      <div className="ctx-actions">
        <button
          type="button"
          className="cta-primary"
          disabled={apply.isPending || !dirty}
          onClick={() =>
            apply.mutate(
              selectedIds.length === 0
                ? null
                : {
                    sync_ids: selectedIds,
                    community_ids: seedCommunities,
                  },
            )
          }
        >
          {selectedIds.length === 0 ? "Clear" : "Apply"}
        </button>
        <button
          type="button"
          className="cta-ghost"
          disabled={apply.isPending}
          onClick={() => {
            setSelectedIds([]);
            apply.mutate(null);
          }}
        >
          Reset
        </button>
      </div>

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
    </section>
  );
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  for (const x of a) if (!setB.has(x)) return false;
  return true;
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
