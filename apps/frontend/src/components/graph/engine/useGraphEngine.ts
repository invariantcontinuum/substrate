import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphHandle } from "@invariantcontinuum/graph/react";
import { useGraphStore } from "@/stores/graph";

export interface UseGraphEngineResult {
  engineRef: React.RefObject<GraphHandle | null>;
  ready: boolean;
  onReady: () => void;
  onPositionsReady: () => void;
  onStatsChange: () => void;
}

export function useGraphEngine(engineThemeJson: unknown): UseGraphEngineResult {
  const engineRef = useRef<GraphHandle | null>(null);
  const [ready, setReady] = useState(false);

  const finalizeLoad = useGraphStore((s) => s.finalizeLoad);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);

  // Push theme JSON into the engine whenever it changes.
  useEffect(() => {
    if (!ready) return;
    engineRef.current?.setTheme(engineThemeJson);
  }, [engineThemeJson, ready]);

  // Keyboard shortcuts — Ctrl+0 fit, Ctrl+=/Ctrl+- zoom, Esc clear selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "0") { e.preventDefault(); engineRef.current?.fit(48); }
        else if (e.key === "=" || e.key === "+") { e.preventDefault(); engineRef.current?.zoomIn(); }
        else if (e.key === "-" || e.key === "_") { e.preventDefault(); engineRef.current?.zoomOut(); }
      }
      if (e.key === "Escape") setSelectedNodeId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelectedNodeId]);

  const onReady = useCallback(() => {
    setReady(true);
    finalizeLoad();
    window.dispatchEvent(new CustomEvent("graph:ready"));
  }, [finalizeLoad]);

  const onPositionsReady = useCallback(() => {
    engineRef.current?.fit(48);
  }, []);

  const onStatsChange = useCallback(() => { finalizeLoad(); }, [finalizeLoad]);

  return { engineRef, ready, onReady, onPositionsReady, onStatsChange };
}
