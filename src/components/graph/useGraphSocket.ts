import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "react-oidc-context";
import { useQueryClient } from "@tanstack/react-query";
import { GraphSocket } from "@/lib/socket";
import { useGraphStore } from "@/stores/graph";
import type cytoscape from "cytoscape";

export function useGraphSocket(cyRef: React.MutableRefObject<cytoscape.Core | null>) {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const socketRef = useRef<GraphSocket | null>(null);
  const setConnectionStatus = useGraphStore((s) => s.setConnectionStatus);
  const setStats = useGraphStore((s) => s.setStats);
  const queryClient = useQueryClient();

  const handleMessage = useCallback(
    (data: unknown) => {
      const msg = data as Record<string, unknown>;
      const cy = cyRef.current;
      if (!cy) return;

      if (msg.type === "snapshot") {
        return;
      }

      if (msg.type === "batch") {
        const events = msg.events as Array<Record<string, unknown>>;
        for (const event of events) {
          switch (event.type) {
            case "node_added": {
              const node = event.node as Record<string, unknown>;
              if (!cy.getElementById(node.id as string).length) {
                const ele = cy.add({ data: node });
                ele.style("opacity", 0);
                ele.animate({ style: { opacity: 1 } }, { duration: 300 });
              }
              break;
            }
            case "node_updated": {
              const node = event.node as Record<string, unknown>;
              const existing = cy.getElementById(node.id as string);
              if (existing.length) existing.data(node);
              break;
            }
            case "node_removed": {
              const id = event.id as string;
              const existing = cy.getElementById(id);
              if (existing.length) {
                existing.animate(
                  { style: { opacity: 0 } },
                  {
                    duration: 300,
                    complete: () => existing.remove(),
                  }
                );
              }
              break;
            }
            case "edge_added": {
              const edge = event.edge as Record<string, unknown>;
              if (!cy.getElementById(edge.id as string).length) {
                cy.add({ data: edge });
              }
              break;
            }
            case "edge_removed": {
              const id = event.id as string;
              cy.getElementById(id).remove();
              break;
            }
          }
        }
        setStats({
          nodeCount: cy.nodes().length,
          edgeCount: cy.edges().length,
          lastUpdated: new Date().toISOString(),
        });
      }
    },
    [cyRef, setStats]
  );

  useEffect(() => {
    if (!token) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const gatewayHost = window.location.hostname === "localhost"
      ? `${window.location.hostname}:8180`
      : `substrate.${window.location.hostname.split(".").slice(-2).join(".")}`;
    const wsUrl =
      import.meta.env.VITE_WS_URL ||
      `${proto}//${gatewayHost}`;

    const socket = new GraphSocket(wsUrl, token, handleMessage, (status) => {
      setConnectionStatus(status);
      if (status === "connected") {
        queryClient.invalidateQueries({ queryKey: ["graph"] });
      }
    });

    socket.connect();
    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, handleMessage, setConnectionStatus, queryClient]);

  return socketRef;
}
