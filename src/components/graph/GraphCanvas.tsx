import { useEffect, useRef, useMemo, useCallback } from "react";
import { useAuth } from "react-oidc-context";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import type { ModalName } from "@/stores/ui";
import { useThemeStore } from "@/stores/theme";
import { darkStylesheet, lightStylesheet } from "./cytoscape-styles";
import { SignalsOverlay } from "./SignalsOverlay";
import { DynamicLegend } from "./DynamicLegend";
import { ViolationBadge } from "./ViolationBadge";

import type cytoscape from "cytoscape";
type Core = cytoscape.Core;
type ElementDefinition = cytoscape.ElementDefinition;

// Raw API response shape (Cytoscape-style wrapped elements)
interface RawElement {
  data?: Record<string, unknown>;
  [key: string]: unknown;
}
interface RawSnapshot {
  nodes?: RawElement[];
  edges?: RawElement[];
  meta?: Record<string, unknown>;
}

const DEFAULT_REPO_URL = "https://github.com/curl/curl.git";

// Lazy-load cytoscape + layout extension (no SSR)
let cyPromise: Promise<typeof cytoscape> | null = null;
let registered = false;

function loadCytoscape() {
  if (!cyPromise) {
    cyPromise = Promise.all([
      import("cytoscape"),
      import("cytoscape-cose-bilkent"),
    ]).then(([cyMod, coseBilkentMod]) => {
      const cy = (cyMod as any).default || cyMod;
      if (!registered) {
        const coseBilkent = (coseBilkentMod as any).default || coseBilkentMod;
        cy.use(coseBilkent as cytoscape.Ext);
        registered = true;
      }
      return cy as typeof cytoscape;
    });
  }
  return cyPromise;
}

/** Convert raw API response into Cytoscape ElementDefinition[] */
function toElements(raw: RawSnapshot | undefined, filters: Set<string>): ElementDefinition[] {
  if (!raw) return [];
  const elements: ElementDefinition[] = [];
  const nodeIds = new Set<string>();

  for (const n of raw.nodes ?? []) {
    const d = (n.data ?? n) as Record<string, unknown>;
    const nodeType = String(d.type || "source");
    if (!filters.has(nodeType)) continue;
    const id = String(d.id);
    nodeIds.add(id);
    elements.push({
      data: {
        id,
        name: d.name || d.label || id,
        type: nodeType,
        domain: d.domain || "",
        status: d.status || "",
        ...d,
      },
    });
  }

  for (const e of raw.edges ?? []) {
    const d = (e.data ?? e) as Record<string, unknown>;
    const source = String(d.source);
    const target = String(d.target);
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    elements.push({
      data: {
        id: d.id ? String(d.id) : `${source}->${target}`,
        source,
        target,
        type: d.type || "depends",
        label: d.label || "",
        weight: d.weight ?? 1,
      },
    });
  }

  return elements;
}

export function GraphCanvas() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const themeMode = useThemeStore((s) => s.theme);
  const stylesheet = useMemo(
    () => (themeMode === "light" ? lightStylesheet : darkStylesheet),
    [themeMode],
  );

  const canvasCleared = useGraphStore((s) => s.canvasCleared);
  const setStats = useGraphStore((s) => s.setStats);
  const selectNode = useGraphStore((s) => s.selectNode);
  const filters = useGraphStore((s) => s.filters);
  const openModal = useUIStore((s) => s.openModal);
  const setDefaultRepoUrl = useUIStore((s) => s.setDefaultRepoUrl);

  const { data: rawData } = useQuery<RawSnapshot>({
    queryKey: ["graph"],
    queryFn: async () => {
      const data = await apiFetch<RawSnapshot>("/api/graph", token);
      logger.info("graph_data_fetched", {
        nodes: (data.nodes ?? []).length,
        edges: (data.edges ?? []).length,
      });
      return data;
    },
    enabled: !!token,
    refetchOnWindowFocus: false,
  });

  const elements = useMemo(
    () => (canvasCleared ? [] : toElements(rawData, filters.types)),
    [rawData, canvasCleared, filters.types],
  );

  // Auto-open SourcesModal when graph is empty
  useEffect(() => {
    if (!rawData) return;
    const nodeCount = (rawData.nodes ?? []).length;
    if (nodeCount === 0) {
      logger.info("empty_graph_detected", { action: "opening_sources_modal" });
      setDefaultRepoUrl(DEFAULT_REPO_URL);
      openModal("sources" as ModalName);
    }
  }, [rawData, openModal, setDefaultRepoUrl]);

  // Node tap handler (stable ref)
  const handleNodeTap = useCallback(
    (evt: { target: { data: () => Record<string, unknown> } }) => {
      const d = evt.target.data();
      logger.info("node_clicked", { nodeId: String(d.id), type: String(d.type || "unknown") });
      selectNode(String(d.id), d);
    },
    [selectNode],
  );

  const handleBgTap = useCallback(
    (evt: { target: Core }) => {
      if (evt.target === cyRef.current) {
        selectNode(null);
      }
    },
    [selectNode],
  );

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    logger.info("cytoscape_init_start", { elementCount: elements.length });

    loadCytoscape().then((cytoscapeFn) => {
      if (destroyed || !containerRef.current) return;

      const cy = cytoscapeFn({
        container: containerRef.current,
        elements,
        style: stylesheet,
        minZoom: 0.2,
        maxZoom: 3.0,
        wheelSensitivity: 0.3,
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: false,
        autoungrabify: false,
        autounselectify: false,
      });

      cyRef.current = cy;

      cy.on("tap", "node", handleNodeTap as unknown as cytoscape.EventHandler);
      cy.on("tap", handleBgTap as unknown as cytoscape.EventHandler);

      if (elements.length > 0) {
        cy.layout({
          name: "cose-bilkent",
          animate: "end" as unknown as boolean,
          animationDuration: 400,
          nodeRepulsion: 8000,
          idealEdgeLength: 120,
          gravity: 0.2,
          numIter: 2500,
        } as cytoscape.LayoutOptions).run();
        logger.info("layout_computation_complete", { layout: "cose-bilkent" });
      }

      // Report stats after layout
      const violationCount = cy.nodes("[status='violation']").length;
      const nodeCount = cy.nodes().length;
      const edgeCount = cy.edges().length;
      setStats({
        nodeCount,
        edgeCount,
        violationCount,
        lastUpdated: new Date().toISOString(),
      });

      logger.info("cytoscape_initialized", { nodes: nodeCount, edges: edgeCount, violations: violationCount });
    }).catch((err) => {
      logger.error("cytoscape_init_failed", { error: String(err) });
    });

    return () => {
      destroyed = true;
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
    // Only re-init when elements or stylesheet fundamentally change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, stylesheet]);

  // Theme switching without full re-init
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    logger.info("theme_switched", { theme: themeMode });
    cy.style().fromJson(stylesheet).update();
  }, [stylesheet, themeMode]);

  return (
    <div
      className="relative w-full h-full"
      style={{
        contain: "layout paint size",
        touchAction: "none",
        overscrollBehavior: "contain",
      }}
    >
      <div
        className="w-full h-full rounded-2xl overflow-hidden relative"
        style={{
          background: "rgba(13,13,18,0.8)",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div ref={containerRef} className="w-full h-full" />
        <SignalsOverlay />
        <ViolationBadge />
        <DynamicLegend />
      </div>
    </div>
  );
}
