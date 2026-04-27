import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  useThreadContext,
  useApplyThreadSelection,
  useThreadCommunities,
  type Selection,
  type SelectionFiles,
  type SelectionCommunities,
  type SelectionDirectories,
  type ThreadContextFile,
  type CommunityRef,
} from "@/hooks/useThreadContext";

type TabKey = "all" | "communities" | "directories";

/**
 * Per-thread context picker. Three tabs select the retrieval mode for
 * the chat pipeline:
 *
 * - All files: pick a subset of the thread's frozen file list, or "all".
 * - Communities: pick Leiden clusters (resolved server-side).
 * - Directories: include any file whose path starts with one of the
 *   selected directory prefixes.
 *
 * Only the active tab's draft is sent on Save — the backend's
 * SelectionUnion is mode-based and rejects cross-mode payloads with 422.
 */
export function ContextFilesModal({
  threadId,
  isOpen,
  onClose,
}: {
  threadId: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Context for this chat"
      size="lg"
      contentClassName="ctx-files-modal"
    >
      {threadId ? (
        <Body threadId={threadId} onClose={onClose} />
      ) : (
        <p className="muted">
          Send your first message to start a thread before curating its
          context.
        </p>
      )}
    </Modal>
  );
}

function Body({
  threadId,
  onClose,
}: {
  threadId: string;
  onClose: () => void;
}) {
  const ctxQ = useThreadContext(threadId);
  const apply = useApplyThreadSelection(threadId);

  const ctx = ctxQ.data?.context;
  const files = useMemo(
    () => ctxQ.data?.files ?? [],
    [ctxQ.data?.files],
  );

  // Initial active tab mirrors the persisted selection.kind so the user
  // sees the same mode they last saved.
  const initialTab: TabKey =
    ctx?.selection.kind === "communities"
      ? "communities"
      : ctx?.selection.kind === "directories"
        ? "directories"
        : "all";

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [search, setSearch] = useState("");

  // Per-tab draft state. Each tab keeps its own draft so flipping tabs
  // doesn't lose work — only the active tab's state is sent on Save.
  const [allFileIds, setAllFileIds] = useState<Set<string>>(() =>
    ctx?.selection.kind === "files"
      ? new Set(ctx.selection.file_ids)
      : new Set(files.map((f) => f.file_id)),
  );
  const [communityRefs, setCommunityRefs] = useState<CommunityRef[]>(() =>
    ctx?.selection.kind === "communities" ? ctx.selection.communities : [],
  );
  const [dirPrefixes, setDirPrefixes] = useState<string[]>(() =>
    ctx?.selection.kind === "directories" ? ctx.selection.dir_prefixes : [],
  );

  // ── Derived data ─────────────────────────────────────────────────
  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.path.toLowerCase().includes(q));
  }, [files, search]);

  const allDirs = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) {
      const parts = f.path.split("/");
      for (let i = 1; i < parts.length; i++) {
        set.add(parts.slice(0, i).join("/") + "/");
      }
    }
    return [...set].sort();
  }, [files]);

  const filteredDirs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allDirs;
    return allDirs.filter((d) => d.toLowerCase().includes(q));
  }, [allDirs, search]);

  // Resolved file count for the footer. Communities resolve server-side
  // so we don't try to count them client-side.
  const includedFiles = useMemo<number | null>(() => {
    if (tab === "all") return allFileIds.size;
    if (tab === "directories") {
      if (dirPrefixes.length === 0) return 0;
      return files.filter((f) =>
        dirPrefixes.some((p) => f.path.startsWith(p)),
      ).length;
    }
    return null;
  }, [tab, allFileIds, files, dirPrefixes]);

  if (ctxQ.isLoading) return <p className="muted">Loading…</p>;

  const onSave = () => {
    let selection: Selection;
    if (tab === "all") {
      const allChecked =
        allFileIds.size === files.length && files.length > 0;
      selection = allChecked
        ? { kind: "all" }
        : ({
            kind: "files",
            file_ids: [...allFileIds],
          } as SelectionFiles);
    } else if (tab === "communities") {
      selection = {
        kind: "communities",
        communities: communityRefs,
      } as SelectionCommunities;
    } else {
      selection = {
        kind: "directories",
        dir_prefixes: dirPrefixes,
      } as SelectionDirectories;
    }
    apply.mutate(selection, { onSuccess: () => onClose() });
  };

  return (
    <>
      <div className="ctx-tabs" role="tablist">
        <button
          type="button"
          className={tab === "all" ? "is-active" : ""}
          onClick={() => {
            setTab("all");
            setSearch("");
          }}
          role="tab"
          aria-selected={tab === "all"}
        >
          All files
        </button>
        <button
          type="button"
          className={tab === "communities" ? "is-active" : ""}
          onClick={() => {
            setTab("communities");
            setSearch("");
          }}
          role="tab"
          aria-selected={tab === "communities"}
        >
          Communities
        </button>
        <button
          type="button"
          className={tab === "directories" ? "is-active" : ""}
          onClick={() => {
            setTab("directories");
            setSearch("");
          }}
          role="tab"
          aria-selected={tab === "directories"}
        >
          Directories
        </button>
      </div>

      <input
        type="search"
        className="ctx-search"
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {tab === "all" && (
        <AllFilesTab
          files={filteredFiles}
          totalFiles={files.length}
          checked={allFileIds}
          setChecked={setAllFileIds}
        />
      )}
      {tab === "communities" && (
        <CommunitiesTab
          threadId={threadId}
          search={search}
          checked={communityRefs}
          setChecked={setCommunityRefs}
        />
      )}
      {tab === "directories" && (
        <DirectoriesTab
          dirs={filteredDirs}
          checked={dirPrefixes}
          setChecked={setDirPrefixes}
        />
      )}

      <div className="ctx-files-actions">
        <span className="muted">
          {tab === "communities"
            ? `${communityRefs.length} communit${communityRefs.length === 1 ? "y" : "ies"} selected`
            : `${includedFiles ?? 0} / ${files.length} files included`}
        </span>
        <button
          type="button"
          className="btn-primary"
          onClick={onSave}
          disabled={apply.isPending}
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

function AllFilesTab({
  files,
  totalFiles,
  checked,
  setChecked,
}: {
  files: ThreadContextFile[];
  totalFiles: number;
  checked: Set<string>;
  setChecked: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const allOn = checked.size === totalFiles && totalFiles > 0;
  const toggleAll = () => {
    if (allOn) setChecked(new Set());
    else setChecked(new Set(files.map((f) => f.file_id)));
  };
  const toggleOne = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  if (totalFiles === 0) {
    return <p className="muted">No files in this thread's scope yet.</p>;
  }
  return (
    <ul className="ctx-files-list">
      <li className="ctx-files-row ctx-files-toolbar-toggle">
        <label>
          <input type="checkbox" checked={allOn} onChange={toggleAll} />
          <span>
            {allOn
              ? `All ${totalFiles} files`
              : `${checked.size} of ${totalFiles} files`}
          </span>
        </label>
      </li>
      {files.map((f) => (
        <li key={f.file_id} className="ctx-files-item">
          <label className="ctx-files-row">
            <input
              type="checkbox"
              checked={checked.has(f.file_id)}
              onChange={() => toggleOne(f.file_id)}
            />
            <span className="ctx-files-name" title={f.path}>
              {f.path}
            </span>
            {f.language && (
              <span className="ctx-files-lang">{f.language}</span>
            )}
          </label>
        </li>
      ))}
    </ul>
  );
}

function CommunitiesTab({
  threadId,
  search,
  checked,
  setChecked,
}: {
  threadId: string;
  search: string;
  checked: CommunityRef[];
  setChecked: React.Dispatch<React.SetStateAction<CommunityRef[]>>;
}) {
  const q = useThreadCommunities(threadId);
  if (q.isLoading) return <p className="muted">Loading communities…</p>;
  const cache_key = q.data?.cache_key ?? null;
  const list = q.data?.communities ?? [];
  if (!cache_key || list.length === 0) {
    return (
      <p className="muted">
        No communities yet — recompute Leiden in Settings → Graph.
      </p>
    );
  }
  const filtered = search
    ? list.filter((c) =>
        c.label.toLowerCase().includes(search.toLowerCase()),
      )
    : list;
  const isOn = (idx: number) =>
    checked.some(
      (c) => c.cache_key === cache_key && c.community_index === idx,
    );
  const toggle = (idx: number) =>
    setChecked((prev) =>
      isOn(idx)
        ? prev.filter(
            (c) =>
              !(c.cache_key === cache_key && c.community_index === idx),
          )
        : [...prev, { cache_key, community_index: idx }],
    );
  return (
    <ul className="ctx-files-list">
      {filtered.map((c) => (
        <li key={c.index} className="ctx-files-item">
          <label className="ctx-files-row">
            <input
              type="checkbox"
              checked={isOn(c.index)}
              onChange={() => toggle(c.index)}
            />
            <span className="ctx-files-name">{c.label}</span>
            <span className="ctx-files-lang">
              {c.size} node{c.size === 1 ? "" : "s"}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function DirectoriesTab({
  dirs,
  checked,
  setChecked,
}: {
  dirs: string[];
  checked: string[];
  setChecked: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  if (dirs.length === 0) {
    return <p className="muted">No subdirectories detected.</p>;
  }
  const toggle = (p: string) =>
    setChecked((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  return (
    <ul className="ctx-files-list">
      {dirs.map((d) => (
        <li key={d} className="ctx-files-item">
          <label className="ctx-files-row">
            <input
              type="checkbox"
              checked={checked.includes(d)}
              onChange={() => toggle(d)}
            />
            <span className="ctx-files-name">{d}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
