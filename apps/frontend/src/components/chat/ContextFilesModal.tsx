import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import {
  useChatContext,
  useApplyChatContext,
} from "@/hooks/useChatContext";
import { useChatContextStore } from "@/stores/chatContext";

interface ChatContextFile {
  id: string;
  filepath: string;
  name: string;
  type: string;
  domain: string;
  language: string;
  size_bytes: number;
}

interface FilesResponse {
  files: ChatContextFile[];
}

/**
 * Per-chat-context file curator. Click on the budget pill opens this
 * modal: it lists every file in the active sync set and lets the user
 * toggle which ones the chat pipeline is allowed to retrieve from.
 *
 * Save persists the curated list back into the active chat context
 * (``ActiveChatContext.file_ids``); the live Zustand store updates
 * immediately so the budget pill, ChatPlaceholder, and any other
 * consumer reflect the change without a remount.
 */
export function ContextFilesModal({
  isOpen,
  onClose,
}: {
  /** Kept for call-site compatibility; the modal no longer scopes by thread. */
  threadId: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Context files"
      size="md"
      contentClassName="ctx-files-modal"
    >
      <ChatContextFilesBody onClose={onClose} />
    </Modal>
  );
}

function ChatContextFilesBody({ onClose }: { onClose: () => void }) {
  const token = useAuthToken();
  const { isLoading: ctxLoading } = useChatContext();
  const active = useChatContextStore((s) => s.active);
  const apply = useApplyChatContext();

  const syncIds = active?.sync_ids ?? [];
  const persistedWhitelist = active?.file_ids ?? null;

  const filesQ = useQuery<FilesResponse>({
    queryKey: ["chat-context-files", syncIds.slice().sort().join(",")],
    enabled: !!token && syncIds.length > 0,
    queryFn: () =>
      apiFetch<FilesResponse>(
        `/api/files?sync_ids=${encodeURIComponent(syncIds.join(","))}`,
        token,
      ),
  });

  const files = useMemo(() => filesQ.data?.files ?? [], [filesQ.data]);

  // Local draft selection. When persistedWhitelist is null every file
  // is "included by default"; we still surface that as a fully-checked
  // local state so the user sees the implicit-include affordance.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Reset/sync local draft whenever the upstream chat-context or file
  // list changes — prevents the modal from getting out of sync after
  // an external Apply (e.g. the user re-saved from the Settings page).
  useEffect(() => {
    if (persistedWhitelist === null) {
      setSelected(new Set(files.map((f) => f.id)));
    } else {
      setSelected(new Set(persistedWhitelist));
    }
  }, [files, persistedWhitelist]);

  if (syncIds.length === 0) {
    return (
      <div className="ctx-files-empty">
        <p>
          No snapshots in your chat context yet. Pick at least one in{" "}
          <Link to="/account/chat-context" onClick={onClose}>
            Settings → Chat Context
          </Link>
          .
        </p>
      </div>
    );
  }
  if (filesQ.isLoading || ctxLoading) {
    return <p className="muted">Loading files…</p>;
  }
  if (files.length === 0) {
    return <p className="muted">No files indexed for the active snapshots.</p>;
  }

  const allChecked = selected.size === files.length;
  const noneChecked = selected.size === 0;

  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(files.map((f) => f.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Detect a real diff vs the persisted whitelist (treat null and
  // "everything checked" as equivalent so saving a noop is a no-op).
  const dirty = (() => {
    if (persistedWhitelist === null) return !allChecked;
    if (persistedWhitelist.length !== selected.size) return true;
    for (const id of persistedWhitelist) if (!selected.has(id)) return true;
    return false;
  })();

  const onSave = () => {
    if (!apply.isPending) {
      // Whole-set selection becomes ``null`` so the backend treats it
      // as "include every file" and future-added files inherit the
      // same intent without surprising exclusions.
      const next_file_ids = allChecked ? null : Array.from(selected);
      apply.mutate(
        {
          sync_ids: syncIds,
          community_ids: active?.community_ids ?? [],
          file_ids: next_file_ids,
        },
        { onSuccess: () => onClose() },
      );
    }
  };

  return (
    <>
      <div className="ctx-files-toolbar">
        <label className="ctx-files-toolbar-toggle">
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => {
              if (el) el.indeterminate = !allChecked && !noneChecked;
            }}
            onChange={toggleAll}
          />
          <span>
            {allChecked
              ? `All ${files.length} files included`
              : noneChecked
                ? `None included`
                : `${selected.size} of ${files.length} included`}
          </span>
        </label>
      </div>
      <ul className="ctx-files-list">
        {files.map((f) => {
          const filename = f.filepath.split("/").pop() || f.filepath;
          const dirname = f.filepath.includes("/")
            ? f.filepath.slice(0, f.filepath.lastIndexOf("/"))
            : "";
          const checked = selected.has(f.id);
          return (
            <li
              key={f.id}
              className={`ctx-files-item${checked ? " is-included" : ""}`}
            >
              <label className="ctx-files-row">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleOne(f.id)}
                />
                <div className="ctx-files-meta">
                  <div className="ctx-files-name-row">
                    <span className="ctx-files-name" title={f.filepath}>
                      {filename}
                    </span>
                    {f.language && (
                      <span className="ctx-files-lang">{f.language}</span>
                    )}
                  </div>
                  {dirname && (
                    <span className="ctx-files-path" title={f.filepath}>
                      {dirname}/
                    </span>
                  )}
                </div>
                <span className="ctx-files-tokens">
                  {(f.size_bytes / 1024).toFixed(1)}
                  <span className="ctx-files-tokens-label"> KB</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="ctx-files-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={onSave}
          disabled={!dirty || apply.isPending}
        >
          {apply.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={onClose}
          disabled={apply.isPending}
        >
          Cancel
        </button>
      </div>
    </>
  );
}

