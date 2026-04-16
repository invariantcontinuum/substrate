import { useEffect, useMemo, useRef, useState } from "react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { useResponsive } from "@/hooks/useResponsive";
import { loadCytoscape } from "@/lib/cytoscapeLoader";
import { useSources } from "@/hooks/useSources";
import { SignalsOverlay } from "./SignalsOverlay";
import { ViolationBadge } from "./ViolationBadge";
import { DynamicLegend } from "./DynamicLegend";

// Above this many nodes we skip force-directed simulation (O(n²)) and
// fall back to the deterministic `grid` layout. Cytoscape can render
// thousands of nodes fine — the layout algorithm is what locks the
// main thread.
const FORCE_LAYOUT_MAX_NODES = 5000;

// Above this many nodes we switch the edge renderer from `straight` +
// triangle arrows to `haystack` and drop arrows entirely. `haystack`
// skips per-edge geometry and arrow-tip drawing — for ~67k edges that's
// the difference between 5-10 fps pan and 30-60 fps. Arrows on a 100k
// graph aren't readable anyway; if the user wants direction they zoom
// to a sub-graph (TODO: future zoom-aware style restoration).
const HUGE_GRAPH_NODES = 10000;

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [ready, setReady] = useState(false);
  const { isMobile } = useResponsive();

  // Subscribe to each slice individually so we only re-render on relevant changes.
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const signals = useGraphStore((s) => s.signals);
  const layoutName = useGraphStore((s) => s.layoutName);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const visibleTypes = useGraphStore((s) => s.filters.types);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const setZoom = useGraphStore((s) => s.setZoom);
  const setLayoutName = useGraphStore((s) => s.setLayoutName);
  const setPan = useGraphStore((s) => s.setPan);
  const finalizeLoad = useGraphStore((s) => s.finalizeLoad);

  const openModal = useUIStore((s) => s.openModal);

  // Apply the legend filter: only nodes whose type is currently toggled on
  // are rendered, and only edges between two visible nodes survive.
  const filtered = useMemo(() => {
    const visibleNodes = nodes.filter((n) =>
      visibleTypes.has(String(n.type || "unknown"))
    );
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = edges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target)
    );
    return { nodes: visibleNodes, edges: visibleEdges };
  }, [nodes, edges, visibleTypes]);

  const { sources } = useSources();
  const sourceLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sources) m.set(s.id, `${s.owner}/${s.name}`);
    return m;
  }, [sources]);

  const elementsWithParents = useMemo(() => {
    const uniqueSourceIds = new Set<string>();
    for (const n of filtered.nodes) {
      const sid = (n as { source_id?: string }).source_id;
      if (sid) uniqueSourceIds.add(sid);
    }
    const parentEls = Array.from(uniqueSourceIds).map((sid) => ({
      group: "nodes" as const,
      data: {
        id: `src:${sid}`,
        label: sourceLabelMap.get(sid) ?? sid.slice(0, 8),
        isSourceParent: true,
      },
      selectable: false,
      grabbable: false,
    }));
    const childNodeEls = filtered.nodes.map((n) => {
      const sid = (n as { source_id?: string }).source_id;
      // Bake label + width into data() once at build time so the
      // per-render width mapper (which used to call ele.data() and
      // recompute on every paint) never runs. For 93k nodes that
      // mapper was a measurable chunk of pan/zoom cost.
      const label =
        (n.label as string | undefined) ||
        (n.name as string | undefined) ||
        (n.id as string);
      const width = Math.max(36, Math.min(label.length * 6.2 + 16, 280));
      return {
        group: "nodes" as const,
        data: { ...n, parent: sid ? `src:${sid}` : undefined, label, width },
      };
    });
    const edgeEls = filtered.edges.map((e) => ({ group: "edges" as const, data: { ...e } }));
    return [...parentEls, ...childNodeEls, ...edgeEls];
  }, [filtered.nodes, filtered.edges, sourceLabelMap]);

  /* init cytoscape */
  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;
    const init = async () => {
      const cytoscape = await loadCytoscape();
      const cy = cytoscape({
        container: containerRef.current,
        elements: [],
        style: [
          {
            selector: "node",
            style: {
              shape: "rectangle",
              // Width is pre-computed in elementsWithParents and stored
              // as data(width) — keeps cytoscape from running a mapper
              // function on every paint, which dominated render cost
              // on a 93k-node graph.
              width: "data(width)",
              height: 22,
              "background-color": "#fff",
              "border-width": 1,
              "border-color": "#000",
              label: "data(label)",
              "font-size": 10,
              "text-valign": "center",
              "text-halign": "center",
              "text-wrap": "none",
              color: "#000",
              "text-outline-width": 0,
            },
          },
          {
            selector: "edge",
            style: {
              width: 1,
              "line-color": "#000",
              "target-arrow-color": "#000",
              "target-arrow-shape": "triangle",
              "curve-style": "straight",
            },
          },
          {
            // Mass-render edge variant for huge graphs — see
            // HUGE_GRAPH_NODES. `haystack` skips control-point geometry
            // and arrows; the dimmer line keeps the dense edge mat from
            // becoming a solid black smear.
            selector: "edge.mass",
            style: {
              width: 0.5,
              "line-color": "rgba(0,0,0,0.35)",
              "target-arrow-shape": "none",
              "curve-style": "haystack",
              "haystack-radius": 0,
            },
          },
          {
            selector: ":selected",
            style: {
              "border-width": 3,
              "border-color": "#000",
              "background-color": "#f0f0f0",
            },
          },
          {
            selector: "node[?isSourceParent]",
            style: {
              shape: "rectangle",
              "background-opacity": 0,
              "border-style": "dashed" as any,
              "border-width": 1,
              "border-color": "rgba(100,120,180,0.5)",
              label: "data(label)",
              "text-valign": "top",
              "text-halign": "left",
              "font-size": 10,
              color: "rgba(0,0,0,0.5)",
              "text-margin-y": -4 as any,
              padding: "24px" as any,
            },
          },
        ],
        minZoom: 0.05,
        maxZoom: 3,
        // Cytoscape warns against customising wheelSensitivity because
        // the step feel depends on OS/mouse/trackpad. Stick to the
        // default so zoom speed matches the platform the user already
        // tuned their pointer for.
        userPanningEnabled: true,
        userZoomingEnabled: true,
        autoungrabify: false,
        // Performance tuning for large graphs (thousands of nodes):
        // render a static texture while the user pans/zooms, skip
        // drawing edges and labels during interaction, and turn off
        // box-select dragging (we don't use it and the hit-testing it
        // adds isn't free at 100k+ elements).
        textureOnViewport: true,
        hideEdgesOnViewport: true,
        hideLabelsOnViewport: true,
        boxSelectionEnabled: false,
        pixelRatio: 1,
      });

      cy.on("tap", "node", (evt) => {
        const id = evt.target.id() as string;
        setSelectedNodeId(id);
        openModal("nodeDetail");
      });

      cy.on("tap", (evt) => {
        if (evt.target === cy) setSelectedNodeId(null);
      });

      cy.on("zoom", () => setZoom(cy.zoom()));
      cy.on("pan", () => setPan(cy.pan()));

      cyRef.current = cy;
      setReady(true);
    };
    init();
    return () => {
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [setSelectedNodeId, setZoom, setPan, openModal]);

  /* update elements */
  useEffect(() => {
    if (!ready || !cyRef.current) return;
    const cy = cyRef.current;
    const childNodeCount = filtered.nodes.length;
    cy.batch(() => {
      cy.elements().remove();
      if (elementsWithParents.length) {
        // label + width are baked into elementsWithParents already, so
        // we hand the array straight to cytoscape — no per-element map.
        cy.add(elementsWithParents);
        // Apply the mass-render edge variant in a single class op while
        // we're still inside the batch — far cheaper than per-edge style
        // updates after the fact.
        if (childNodeCount > HUGE_GRAPH_NODES) {
          cy.edges().addClass("mass");
        }
      }
    });
    // Pick a cheap, deterministic layout when the graph is large so we don't
    // lock the main thread on a force-directed simulation.
    const effectiveLayout =
      childNodeCount > FORCE_LAYOUT_MAX_NODES ? "grid" : (layoutName || "cose");
    const layout = cy.layout({ name: effectiveLayout as any, padding: 30, animate: false, fit: true });
    // Finalise the topbar load timer once the layout actually settles —
    // that's when the user sees the graph, not when the fetch returned.
    // No-op unless a fetchGraph is awaiting (loadStartedAt set).
    layout.one("layoutstop", () => finalizeLoad());
    layout.run();
  }, [elementsWithParents, filtered.nodes.length, layoutName, ready, isMobile, finalizeLoad]);

  // Zoom/pan flow one-way: cytoscape → store via the `zoom`/`pan` events
  // registered in init. We deliberately don't push store zoom back into
  // cytoscape here — that would create a feedback loop with the event
  // listener (each zoom event sets store, which re-applies zoom, which
  // fires another zoom event, etc.), locking the main thread.

  /* selection highlight */
  useEffect(() => {
    if (!cyRef.current) return;
    cyRef.current.nodes().unselect();
    if (selectedNodeId) cyRef.current.getElementById(selectedNodeId).select();
  }, [selectedNodeId]);

  /* signals pulse */
  useEffect(() => {
    if (!cyRef.current || !signals.length) return;
    const cy = cyRef.current;
    const ids = new Set(signals.map((s) => s.nodeId));
    ids.forEach((id) => {
      const n = cy.getElementById(id);
      if (!n.length) return;
      n.animate({ style: { "border-width": 6 } }, { duration: 250 });
      setTimeout(() => {
        n.animate({ style: { "border-width": 2 } }, { duration: 250 });
      }, 260);
    });
  }, [signals]);

  // Node size is driven by the label (shape: rectangle, width/height: "label")
  // so there's nothing to sync here.

  /* keyboard shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "0") {
          e.preventDefault();
          cyRef.current?.fit(undefined, 48);
        } else if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          cyRef.current?.zoom(cyRef.current.zoom() * 1.1);
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          cyRef.current?.zoom(cyRef.current.zoom() * 0.9);
        }
      }
      if (e.key === "Escape") {
        setSelectedNodeId(null);
      }
      if (e.key.toLowerCase() === "l" && !e.ctrlKey && !e.metaKey) {
        setLayoutName(layoutName === "cose" ? "breadthfirst" : "cose");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layoutName, setLayoutName, setSelectedNodeId]);

  return (
    <div className="graph-canvas">
      <div className="graph-canvas-inner">
        <div ref={containerRef} className="graph-canvas-container" />
      </div>

      <div className="graph-overlay-group">
        <SignalsOverlay />
        <ViolationBadge />
        <DynamicLegend />
      </div>

      <div className="graph-toolbar">
        <button onClick={() => cyRef.current?.fit(undefined, 48)} title="Fit">⊘</button>
        <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.1)} title="Zoom in">+</button>
        <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.9)} title="Zoom out">−</button>
        <button onClick={() => setLayoutName(layoutName === "cose" ? "breadthfirst" : "cose")} title="Relayout">L</button>
      </div>
    </div>
  );
}
