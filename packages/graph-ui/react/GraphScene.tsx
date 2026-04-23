import { forwardRef, useCallback, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Graph, type GraphHandle, type GraphProps } from "./Graph";
import { GridOverlay } from "./GridOverlay";
import { CompoundFramesOverlay } from "./CompoundFramesOverlay";
import { LabelOverlay } from "./LabelOverlay";
import { EdgeLabelsOverlay } from "./EdgeLabelsOverlay";
import { buildGraphTheme } from "./theme/buildTheme";
import { graphThemeToEngineJson } from "./theme/toEngineTheme";
import type { GraphTheme } from "./theme/types";

export type ThemeMode = "light" | "dark";

export interface GraphSceneProps
  extends Omit<GraphProps, "theme" | "className" | "style"> {
  /** The only theme knob an embedder needs to set — internal buildTheme()
   *  turns this into the full GraphTheme + engine JSON in one place so every
   *  overlay + the WASM shader stay in lock-step. */
  themeMode: ThemeMode;
  /** Ordered list of node ids matching the snapshot's node order. Used by
   *  overlays for label/frame lookup. Defaults to `snapshot.nodes.map(n=>n.id)`
   *  if omitted. */
  nodeIds?: string[];
  /** Map nodeId → display label. Defaults to node.name from snapshot. */
  labels?: Record<string, string>;
  /** Map nodeId → type string (drives per-type styling in overlays). */
  nodeTypes?: Record<string, string>;
  /** Map nodeId → source_id for compound-frame grouping. `null` skips. */
  nodeSourceIds?: Record<string, string | null>;
  /** Map source_id → human label (e.g., "owner/repo"). */
  sourceLabels?: Record<string, string>;
  /** Set of node ids in the current 1-hop spotlight (focus + neighbors).
   *  When present, overlays dim labels/frames for nodes outside the set to
   *  match the WASM shader's dim behaviour. Pass `null` for no spotlight. */
  focusIds?: Set<string> | null;
  /** Slot for app-specific chrome (toolbar, legend, signals, etc.) stacked on
   *  top of the scene. Kept as a render slot so the package stays free of
   *  app-specific Zustand/TanStack imports. */
  chrome?: ReactNode;
  /** Extra CSS class on the scene container (for layout / sizing). */
  className?: string;
  style?: CSSProperties;
}

/**
 * GraphScene — the full Cytoscape-style rendering pipeline in one component.
 *
 * Composes:
 *   1. GridOverlay            (camera-synced background grid)
 *   2. CompoundFramesOverlay  (dashed group frames around source clusters)
 *   3. Graph                  (WASM/WebGL2 nodes + edges — the engine)
 *   4. LabelOverlay           (Canvas2D text labels w/ spotlight-aware dim)
 *   5. EdgeLabelsOverlay      (type pills on focus-edges)
 *
 * Consumers pass `themeMode` + snapshot; the package handles theme
 * propagation, JSON marshalling to the WASM engine, and z-order. Frontend
 * apps drop this in a sized box and add their own toolbar / panel chrome
 * via the `chrome` slot.
 */
export const GraphScene = forwardRef<GraphHandle, GraphSceneProps>(function GraphScene(
  props,
  ref,
) {
  const {
    themeMode,
    snapshot,
    nodeIds: nodeIdsProp,
    labels: labelsProp,
    nodeTypes: nodeTypesProp,
    nodeSourceIds,
    sourceLabels,
    focusIds,
    chrome,
    className,
    style,
    ...graphProps
  } = props;

  const graphTheme: GraphTheme = useMemo(
    () => buildGraphTheme(themeMode),
    [themeMode],
  );
  const engineTheme = useMemo(
    () => graphThemeToEngineJson(graphTheme),
    [graphTheme],
  );

  // Derive overlay inputs from the snapshot when the caller hasn't supplied
  // them directly. Keeping the derivation here means small apps can hand
  // GraphScene just `{themeMode, snapshot}` and get a complete, working
  // scene with no extra plumbing.
  const nodeIds = useMemo(
    () => nodeIdsProp ?? snapshot?.nodes.map((n) => n.id) ?? [],
    [nodeIdsProp, snapshot],
  );
  const labels = useMemo(() => {
    if (labelsProp) return labelsProp;
    const m: Record<string, string> = {};
    for (const n of snapshot?.nodes ?? []) m[n.id] = n.name;
    return m;
  }, [labelsProp, snapshot]);
  const nodeTypes = useMemo(() => {
    if (nodeTypesProp) return nodeTypesProp;
    const m: Record<string, string> = {};
    for (const n of snapshot?.nodes ?? []) m[n.id] = n.type ?? "external";
    return m;
  }, [nodeTypesProp, snapshot]);

  // Local ref to propagate to each overlay. Using a proxy-like approach: the
  // forwarded `ref` and the overlays' `engineRef` point at the same Graph
  // instance.
  // We pass the same ref to Graph and to every overlay — React's ref
  // mechanics require a mutable ref object here, not the forwarded one,
  // because callback refs would invalidate the overlays' useEffect deps.
  const engineRef = useMemo(
    () => ({ current: null as GraphHandle | null }),
    [],
  );
  const setRef = (node: GraphHandle | null) => {
    engineRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<GraphHandle | null>).current = node;
  };

  // Gate overlay subscriptions on the engine actually being initialised.
  // Without this, overlays attempt to call `engineRef.current.subscribeFrame`
  // before the WASM worker has mounted and silently never receive updates —
  // labels would stay invisible until the next dep change retrigger.
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => {
    setReady(true);
    graphProps.onReady?.();
  }, [graphProps]);

  const spotlightActive = focusIds != null && focusIds.size > 0;

  return (
    <div
      className={`graph-scene${className ? " " + className : ""}`}
      data-spotlight-active={spotlightActive ? "true" : "false"}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        ...style,
      }}
    >
      <GridOverlay engineRef={engineRef} theme={graphTheme} ready={ready} />
      {nodeSourceIds && sourceLabels ? (
        <CompoundFramesOverlay
          engineRef={engineRef}
          theme={graphTheme}
          ready={ready}
          nodeIds={nodeIds}
          nodeSourceIds={nodeSourceIds}
          nodeTypes={nodeTypes}
          sourceLabels={sourceLabels}
        />
      ) : null}
      <Graph
        {...graphProps}
        ref={setRef}
        snapshot={snapshot}
        theme={engineTheme as Record<string, unknown>}
        onReady={onReady}
        className="graph-canvas-webgl"
        style={{ width: "100%", height: "100%" }}
      />
      <LabelOverlay
        engineRef={engineRef}
        theme={graphTheme}
        nodeIds={nodeIds}
        labels={labels}
        nodeTypes={nodeTypes}
        ready={ready}
        minZoomToShowLabels={0.0}
        focusIds={focusIds}
      />
      <EdgeLabelsOverlay engineRef={engineRef} theme={graphTheme} ready={ready} />
      {chrome}
    </div>
  );
});
