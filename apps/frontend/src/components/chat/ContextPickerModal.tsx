import { useState } from "react";
import {
  useSources, useSnapshots, useDirectories,
  usePickerFiles, usePickerCommunities, usePickerNodes,
  type CommunityRow,
} from "@/hooks/useIngestedTree";
import type { Entry } from "@/types/chat";

type Tab = "files" | "communities" | "nodes";
type EdgeType = "DEPENDS_ON" | "CALLS" | "USED_BY";

export interface ContextPickerModalProps {
  open: boolean;
  onClose: () => void;
  onAddEntries: (entries: Entry[]) => void;
}

export function ContextPickerModal({ open, onClose, onAddEntries }: ContextPickerModalProps) {
  const [search, setSearch]   = useState("");
  const [sourceId, setSrc]    = useState<string | null>(null);
  const [syncId, setSync]     = useState<string | null>(null);
  const [dirPrefix, setDir]   = useState<string>("");
  const [tab, setTab]         = useState<Tab>("files");
  const [picked, setPicked]   = useState<Set<string>>(new Set());

  if (!open) return null;
  return (
    <div className="ctx-picker-scrim" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ctx-picker" onClick={e => e.stopPropagation()}>
        <header className="ctx-picker-head">
          <input
            placeholder="Search…" value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search"
          />
          <button onClick={onClose} aria-label="Close picker">×</button>
        </header>
        <div className="ctx-picker-body">
          <TreePane
            sourceId={sourceId} setSrc={setSrc}
            syncId={syncId}    setSync={setSync}
            dirPrefix={dirPrefix} setDir={setDir}
            onAddSourceChip={(sid) => onAddEntries([{ type: "source", source_id: sid }])}
            onAddSnapshotChip={(syid) => onAddEntries([{ type: "snapshot", sync_id: syid }])}
            onAddDirectoryChip={(prefix) => syncId && onAddEntries([{ type: "directory", sync_id: syncId, prefix }])}
          />
          <ContentPane
            tab={tab} setTab={setTab}
            syncId={syncId} dirPrefix={dirPrefix} search={search}
            picked={picked} setPicked={setPicked}
            onAddSelected={(entries) => { onAddEntries(entries); setPicked(new Set()); }}
          />
        </div>
      </div>
    </div>
  );
}

function TreePane(props: {
  sourceId: string | null; setSrc: (s: string | null) => void;
  syncId:   string | null; setSync: (s: string | null) => void;
  dirPrefix: string;       setDir: (s: string) => void;
  onAddSourceChip:    (sid: string) => void;
  onAddSnapshotChip:  (syid: string) => void;
  onAddDirectoryChip: (prefix: string) => void;
}) {
  const sources   = useSources();
  const snapshots = useSnapshots(props.sourceId);
  const dirs      = useDirectories(props.syncId, props.dirPrefix);
  return (
    <aside className="ctx-tree">
      <ul>
        {sources.data?.map(s => (
          <li key={s.source_id}>
            <span>
              <button onClick={() => { props.setSrc(s.source_id); props.setSync(null); props.setDir(""); }}>
                {s.name}
              </button>
              <button onClick={() => props.onAddSourceChip(s.source_id)} aria-label="Add source chip">+</button>
            </span>
            {props.sourceId === s.source_id && (
              <ul>
                {snapshots.data?.map(snap => (
                  <li key={snap.sync_id}>
                    <span>
                      <button onClick={() => { props.setSync(snap.sync_id); props.setDir(""); }}>
                        {snap.created_at.slice(0, 10)}
                      </button>
                      <button onClick={() => props.onAddSnapshotChip(snap.sync_id)} aria-label="Add snapshot chip">+</button>
                    </span>
                    {props.syncId === snap.sync_id && (
                      <ul>
                        {dirs.data?.map(seg => (
                          <li key={seg}>
                            <span>
                              <button onClick={() => props.setDir(`${props.dirPrefix}${seg}/`)}>
                                {seg}/
                              </button>
                              <button
                                onClick={() => props.onAddDirectoryChip(`${props.dirPrefix}${seg}/`)}
                                aria-label="Add directory chip"
                              >+</button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function ContentPane(props: {
  tab: Tab; setTab: (t: Tab) => void;
  syncId: string | null; dirPrefix: string; search: string;
  picked: Set<string>; setPicked: (s: Set<string>) => void;
  onAddSelected: (entries: Entry[]) => void;
}) {
  return (
    <section className="ctx-content">
      <nav className="ctx-tabs">
        {(["files", "communities", "nodes"] as Tab[]).map(t => (
          <button key={t} aria-pressed={props.tab === t} onClick={() => props.setTab(t)}>{t}</button>
        ))}
      </nav>
      {props.tab === "files" && (
        <FilesTab
          syncId={props.syncId} dirPrefix={props.dirPrefix} search={props.search}
          picked={props.picked} setPicked={props.setPicked}
          onAddSelected={props.onAddSelected}
        />
      )}
      {props.tab === "communities" && (
        <CommunitiesTab
          syncId={props.syncId}
          onAddCommunity={(c) =>
            props.onAddSelected([{ type: "community", cache_key: c.cache_key, community_index: c.community_index }])
          }
        />
      )}
      {props.tab === "nodes" && (
        <NodesTab
          syncId={props.syncId} search={props.search}
          onAddNode={(nodeId, depth, edges) =>
            props.onAddSelected([{ type: "node_neighborhood", node_id: nodeId, depth, edge_types: edges }])
          }
        />
      )}
    </section>
  );
}

function FilesTab(props: {
  syncId: string | null; dirPrefix: string; search: string;
  picked: Set<string>; setPicked: (s: Set<string>) => void;
  onAddSelected: (entries: Entry[]) => void;
}) {
  const files = usePickerFiles(props.syncId, props.dirPrefix, props.search);
  const toggle = (id: string) => {
    const next = new Set(props.picked);
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    props.setPicked(next);
  };
  return (
    <div className="ctx-files-inner">
      <ul className="ctx-list">
        {files.data?.map(f => (
          <li key={f.file_id}>
            <label>
              <input type="checkbox" checked={props.picked.has(f.file_id)} onChange={() => toggle(f.file_id)} />
              <span>{f.path}</span>{" "}
              <small>{f.language ?? ""} · {Math.ceil((f.size_bytes ?? 0) / 1024)}kb</small>
            </label>
          </li>
        ))}
      </ul>
      <button
        disabled={props.picked.size === 0}
        onClick={() => props.onAddSelected(
          [...props.picked].map(id => ({ type: "file", file_id: id }))
        )}
      >Add selected ({props.picked.size})</button>
    </div>
  );
}

function CommunitiesTab(props: { syncId: string | null; onAddCommunity: (c: CommunityRow) => void }) {
  const communities = usePickerCommunities(props.syncId);
  return (
    <ul className="ctx-list">
      {communities.data?.map(c => (
        <li key={`${c.cache_key}-${c.community_index}`}>
          <span>c-{c.community_index} · {c.size} nodes · &ldquo;{c.label}&rdquo;</span>
          <button onClick={() => props.onAddCommunity(c)}>Add</button>
        </li>
      ))}
    </ul>
  );
}

function NodesTab(props: {
  syncId: string | null; search: string;
  onAddNode: (nodeId: string, depth: 1 | 2 | 3, edge_types: EdgeType[]) => void;
}) {
  const nodes = usePickerNodes(props.syncId, props.search);
  const [picking, setPicking] = useState<string | null>(null);
  const [depth, setDepth]     = useState<1 | 2 | 3>(1);
  const [edges, setEdges]     = useState<EdgeType[]>(["DEPENDS_ON", "CALLS", "USED_BY"]);
  return (
    <ul className="ctx-list">
      {nodes.data?.map(n => (
        <li key={n.node_id}>
          <button onClick={() => setPicking(n.node_id)}>{n.path}</button>
          {picking === n.node_id && (
            <div className="ctx-node-popover">
              <label>Depth
                <select value={depth} onChange={e => setDepth(Number(e.target.value) as 1 | 2 | 3)}>
                  <option value={1}>1-hop</option>
                  <option value={2}>2-hop</option>
                  <option value={3}>3-hop</option>
                </select>
              </label>
              {(["DEPENDS_ON", "CALLS", "USED_BY"] as const).map(et => (
                <label key={et}>
                  <input
                    type="checkbox"
                    checked={edges.includes(et)}
                    onChange={e => {
                      setEdges(e.target.checked ? [...edges, et] : edges.filter(x => x !== et));
                    }}
                  />
                  {et}
                </label>
              ))}
              <button
                disabled={edges.length === 0}
                onClick={() => { props.onAddNode(n.node_id, depth, edges); setPicking(null); }}
              >Add chip</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
