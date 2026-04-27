import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionHeader } from "@/components/common/SectionHeader";
import { SourceSnapshotMultiSelect } from "@/components/select/SourceSnapshotMultiSelect";
import {
  useChatContext,
  useApplyChatContext,
} from "@/hooks/useChatContext";
import { useEffectiveConfig, useApplyConfig } from "@/hooks/useRuntimeConfig";
import { useAuthToken } from "@/hooks/useAuthToken";
import { apiFetch } from "@/lib/api";

interface ChatConfig {
  chat_top_k?: number;
  chat_history_turns?: number;
  chat_total_budget_chars?: number;
  chat_context_token_budget?: number;
}

interface CommunityRef {
  cache_key: string;
  community_index: number;
}

interface CommunityListResponse {
  cache_key: string;
  communities: { index: number; label: string; size: number }[];
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
  seedCommunities: CommunityRef[];
}

function ChatContextEditor({ seed, seedCommunities }: EditorProps) {
  const { config: chatCfg } = useEffectiveConfig<ChatConfig>("chat");
  const applyChatCfg = useApplyConfig("chat");
  const apply = useApplyChatContext();
  const token = useAuthToken();

  const [selectedIds, setSelectedIds] = useState<string[]>(seed);
  const [selectedCommunities, setSelectedCommunities] =
    useState<CommunityRef[]>(seedCommunities);

  // Communities are scoped to a Leiden cache_key, which is itself
  // derived from the (sorted) sync_ids + config. Whenever the sync set
  // changes we ask the graph service for the active set's community
  // breakdown and offer it as a checkbox list. The selection survives
  // sync_id changes only when the resulting cache_key matches.
  const sortedKey = selectedIds.slice().sort().join(",");
  const communitiesQ = useQuery<CommunityListResponse>({
    queryKey: ["chat-context-communities", sortedKey],
    enabled: !!token && selectedIds.length > 0,
    queryFn: () =>
      apiFetch<CommunityListResponse>(
        `/api/communities?sync_ids=${encodeURIComponent(selectedIds.join(","))}`,
        token,
      ),
  });

  const communities = communitiesQ.data?.communities ?? [];
  const cacheKey = communitiesQ.data?.cache_key ?? null;

  const dirty =
    !arraysEqual(selectedIds, seed) ||
    !communityArraysEqual(selectedCommunities, seedCommunities);

  const toggleCommunity = (index: number) => {
    if (!cacheKey) return;
    const has = selectedCommunities.some(
      (c) => c.cache_key === cacheKey && c.community_index === index,
    );
    setSelectedCommunities((prev) =>
      has
        ? prev.filter(
            (c) => !(c.cache_key === cacheKey && c.community_index === index),
          )
        : [...prev, { cache_key: cacheKey, community_index: index }],
    );
  };

  const isCommunitySelected = (index: number): boolean =>
    !!cacheKey &&
    selectedCommunities.some(
      (c) => c.cache_key === cacheKey && c.community_index === index,
    );

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

      <SectionHeader title="Communities" />
      <p className="muted">
        Restrict retrieval to specific Leiden communities for the active
        sync set. Leave empty to draw from every community.
      </p>
      {selectedIds.length === 0 ? (
        <p className="muted"><em>Select snapshots above first.</em></p>
      ) : communitiesQ.isLoading ? (
        <p className="muted"><em>Loading communities…</em></p>
      ) : communities.length === 0 ? (
        <p className="muted">
          <em>No communities yet — recompute Leiden on Settings → Graph.</em>
        </p>
      ) : (
        <div className="ctx-community-list">
          {communities.map((c) => (
            <label key={c.index} className="conn-field conn-field--toggle">
              <span>
                {c.label} <span className="muted">· {c.size} node{c.size === 1 ? "" : "s"}</span>
              </span>
              <input
                type="checkbox"
                checked={isCommunitySelected(c.index)}
                onChange={() => toggleCommunity(c.index)}
              />
            </label>
          ))}
        </div>
      )}

      <div className="ctx-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={apply.isPending || !dirty}
          onClick={() =>
            apply.mutate(
              selectedIds.length === 0
                ? null
                : {
                    sync_ids: selectedIds,
                    community_ids: selectedCommunities,
                  },
            )
          }
        >
          {selectedIds.length === 0 ? "Clear" : "Apply"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={apply.isPending}
          onClick={() => {
            setSelectedIds([]);
            setSelectedCommunities([]);
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

function communityArraysEqual(
  a: CommunityRef[],
  b: CommunityRef[],
): boolean {
  if (a.length !== b.length) return false;
  const key = (c: CommunityRef) => `${c.cache_key}|${c.community_index}`;
  const setB = new Set(b.map(key));
  for (const c of a) if (!setB.has(key(c))) return false;
  return true;
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
