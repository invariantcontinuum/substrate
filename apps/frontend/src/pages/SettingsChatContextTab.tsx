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
}

export function SettingsChatContextTab() {
  const { data: active } = useChatContext();
  // Re-mount the inner editor whenever the server-side identity changes
  // so the local draft re-seeds from the new server snapshot without an
  // effect-driven setState (react-hooks/set-state-in-effect).
  const seedKey =
    [...(active?.active?.sync_ids ?? [])].sort().join(",") +
    "|" +
    [...(active?.active?.source_ids ?? [])].sort().join(",");
  return (
    <ChatContextEditor
      key={seedKey || "empty"}
      seedSyncIds={active?.active?.sync_ids ?? []}
      seedSourceIds={active?.active?.source_ids ?? []}
    />
  );
}

interface EditorProps {
  seedSyncIds:   string[];
  seedSourceIds: string[];
}

function ChatContextEditor({ seedSyncIds, seedSourceIds }: EditorProps) {
  const { config: chatCfg } = useEffectiveConfig<ChatConfig>("chat");
  const applyChatCfg = useApplyConfig("chat");
  const apply = useApplyChatContext();

  const [syncIds, setSyncIds] = useState<string[]>(seedSyncIds);
  const [sourceIds, setSourceIds] = useState<string[]>(seedSourceIds);

  const dirty =
    !arraysEqual(syncIds, seedSyncIds) ||
    !arraysEqual(sourceIds, seedSourceIds);
  const empty = syncIds.length === 0 && sourceIds.length === 0;

  return (
    <section className="settings-chat-context">
      <h3>Chat Context</h3>

      <SectionHeader title="Sources & snapshots" />
      <p className="muted">
        Selected sources and snapshots are frozen onto every{" "}
        <strong>new</strong> chat thread. Existing threads keep their
        original scope. Communities and per-file selections happen
        per-thread in the chat pill.
      </p>
      <SourceSnapshotMultiSelect
        syncIds={syncIds}
        sourceIds={sourceIds}
        onChange={(next) => {
          setSyncIds(next.sync_ids);
          setSourceIds(next.source_ids);
        }}
        completedOnly
      />

      <div className="ctx-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={apply.isPending || !dirty}
          onClick={() =>
            apply.mutate(
              empty
                ? null
                : { sync_ids: syncIds, source_ids: sourceIds },
            )
          }
        >
          {empty ? "Clear" : "Apply"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={apply.isPending}
          onClick={() => {
            setSyncIds([]);
            setSourceIds([]);
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
