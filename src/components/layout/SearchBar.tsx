import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { Input } from "@/components/ui/input";

interface NodeLike {
  id: string;
  name?: string;
  file_path?: string;
  type?: string;
}

const MAX_RESULTS = 20;

function score(n: NodeLike, q: string): number | null {
  const needle = q.toLowerCase();
  const name = (n.name || "").toLowerCase();
  const path = (n.file_path || "").toLowerCase();
  const id = String(n.id).toLowerCase();
  if (name === needle || path === needle) return 0;
  if (name.startsWith(needle)) return 1;
  if (path.endsWith("/" + needle) || path.endsWith(needle)) return 2;
  if (name.includes(needle)) return 3;
  if (path.includes(needle)) return 4;
  if (id.includes(needle)) return 5;
  return null;
}

export function SearchBar() {
  const nodes = useGraphStore((s) => s.nodes);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const openModal = useUIStore((s) => s.openModal);

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const loaded = nodes.length > 0;

  const results = useMemo(() => {
    const needle = q.trim();
    if (!needle) return [] as NodeLike[];
    const scored: Array<{ n: NodeLike; s: number }> = [];
    for (const n of nodes as NodeLike[]) {
      const s = score(n, needle);
      if (s != null) scored.push({ n, s });
      if (scored.length > MAX_RESULTS * 4) break;
    }
    scored.sort((a, b) => a.s - b.s);
    return scored.slice(0, MAX_RESULTS).map((r) => r.n);
  }, [q, nodes]);

  useEffect(() => {
    setCursor(0);
  }, [q]);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const select = useCallback(
    (node: NodeLike) => {
      setSelectedNodeId(String(node.id));
      openModal("nodeDetail");
      setOpen(false);
      setQ("");
    },
    [setSelectedNodeId, openModal],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) {
      if (e.key === "Enter" && results[0]) {
        e.preventDefault();
        select(results[0]);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = results[cursor];
      if (picked) select(picked);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="top-nav-search-wrap" ref={wrapRef}>
      <div className="top-nav-search">
        <Search size={12} />
        <Input
          type="text"
          placeholder={loaded ? "Search nodes…" : "Load a graph first"}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          disabled={!loaded}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      {open && q.trim().length > 0 && (
        <div className="top-nav-search-dropdown" role="listbox">
          {results.length === 0 ? (
            <div className="top-nav-search-empty">No matches</div>
          ) : (
            results.map((n, i) => {
              const display = n.name || n.file_path || String(n.id);
              const sub =
                n.file_path && n.file_path !== display
                  ? n.file_path
                  : n.type ?? "";
              return (
                <button
                  key={n.id}
                  type="button"
                  role="option"
                  aria-selected={i === cursor}
                  className={`top-nav-search-item${i === cursor ? " is-active" : ""}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => select(n)}
                >
                  <span className="top-nav-search-item-name">{display}</span>
                  {sub && <span className="top-nav-search-item-sub">{sub}</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
