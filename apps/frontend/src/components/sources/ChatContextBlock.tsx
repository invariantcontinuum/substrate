import { useState } from "react";
import { useSources } from "@/hooks/useSources";
import { useAllSyncs } from "@/hooks/useAllSyncs";
import { useChatContext, useApplyChatContext } from "@/hooks/useChatContext";
import { CommunityPicker } from "./CommunityPicker";

export function ChatContextBlock() {
  const { sources } = useSources();
  const { syncs } = useAllSyncs();
  const { data: active } = useChatContext();
  const apply = useApplyChatContext();

  const [sourceId, setSourceId] = useState<string>(
    active?.active?.source_id ?? "",
  );
  const [snapshotIds, setSnapshotIds] = useState<Set<string>>(
    new Set(active?.active?.snapshot_ids ?? []),
  );
  const [communityIds, setCommunityIds] = useState<
    { cache_key: string; community_index: number }[]
  >(active?.active?.community_ids ?? []);

  const sourceSyncs = (syncs ?? []).filter((s) => s.source_id === sourceId);
  const snapshotIdList = Array.from(snapshotIds);

  return (
    <section className="chat-context-block">
      <h3>Chat context</h3>
      <p className="muted">
        Selected source, snapshots, and communities will be attached to every{" "}
        <strong>new</strong> chat thread you create. Existing threads keep
        their original scope.
      </p>
      <label className="ctx-row">
        <span>Source</span>
        <select
          value={sourceId}
          onChange={(e) => {
            setSourceId(e.target.value);
            setSnapshotIds(new Set());
            setCommunityIds([]);
          }}
        >
          <option value="">(none)</option>
          {sources?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.owner}/{s.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="ctx-snapshots">
        <legend>Snapshots</legend>
        {sourceSyncs.length === 0 ? (
          <p className="muted">Pick a source to choose snapshots.</p>
        ) : (
          sourceSyncs.map((s) => (
            <label key={s.id} className="ctx-row">
              <input
                type="checkbox"
                checked={snapshotIds.has(s.id)}
                onChange={() => {
                  const next = new Set(snapshotIds);
                  if (next.has(s.id)) next.delete(s.id);
                  else next.add(s.id);
                  setSnapshotIds(next);
                  setCommunityIds([]);
                }}
              />
              <span>
                {s.id.slice(0, 8)} · {s.status}
              </span>
            </label>
          ))
        )}
      </fieldset>
      <CommunityPicker
        snapshotIds={snapshotIdList}
        value={communityIds}
        onChange={setCommunityIds}
      />
      <div className="ctx-actions">
        <button
          type="button"
          disabled={!sourceId || snapshotIds.size === 0 || apply.isPending}
          onClick={() =>
            apply.mutate({
              source_id: sourceId,
              snapshot_ids: snapshotIdList,
              community_ids: communityIds,
            })
          }
        >
          Apply
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setSourceId("");
            setSnapshotIds(new Set());
            setCommunityIds([]);
            apply.mutate(null);
          }}
        >
          Clear
        </button>
      </div>
    </section>
  );
}
