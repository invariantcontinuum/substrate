import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { SlimNode } from "@/stores/graph";
import type { GraphHandle } from "@invariantcontinuum/graph/react";

export interface GraphSearchProps {
  slimNodes: SlimNode[];
  engineRef: React.RefObject<GraphHandle>;
  onOpenDetail: (node: { id: string }) => void;
  maxResults?: number;
}

function score(node: SlimNode, q: string): number {
  const name = (node.name || "").toLowerCase();
  const id = node.id.toLowerCase();
  const needle = q.toLowerCase();
  if (name.startsWith(needle)) return 3;
  if (name.includes(needle)) return 2;
  if (id.includes(needle)) return 1;
  return 0;
}

export function GraphSearch({ slimNodes, engineRef, onOpenDetail, maxResults = 20 }: GraphSearchProps) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!q.trim()) return [];
    return slimNodes
      .map((n) => [score(n, q), n] as const)
      .filter(([s]) => s > 0)
      .sort((a, b) => b[0] - a[0])
      .slice(0, maxResults)
      .map(([, n]) => n);
  }, [q, slimNodes, maxResults]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === "k") || e.key === "/") {
        const active = document.activeElement;
        const typingElsewhere =
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement;
        if (!typingElsewhere) {
          e.preventDefault();
          inputRef.current?.focus();
          setOpen(true);
        }
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="graph-search" style={{ position: "relative" }}>
      <button
        type="button"
        className="graph-search-button"
        title="Search nodes (Ctrl+K / /)"
        aria-label="Search"
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        <Search size={16} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="graph-search-popover">
          <input
            ref={inputRef}
            type="text"
            value={q}
            placeholder="Search nodes by name or id…"
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            autoFocus
          />
          {results.length > 0 && (
            <ul className="graph-search-results">
              {results.map((n) => (
                <li
                  key={n.id}
                  onMouseDown={() => {
                    engineRef.current?.selectNode(n.id);
                    engineRef.current?.fit(80);
                    onOpenDetail({ id: n.id });
                    setOpen(false);
                  }}
                >
                  <span className="type-chip">{n.type}</span>
                  <span className="name">{n.name}</span>
                  <span className="id">{n.id}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
