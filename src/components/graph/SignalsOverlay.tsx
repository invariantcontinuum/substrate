import { useGraphStore } from "@/stores/graph";

export function SignalsOverlay() {
  const signals = useGraphStore((s) => s.signals);
  if (!signals.length) return null;

  const last = signals.slice(-3);

  return (
    <div className="signals-overlay">
      {last.map((s, i) => (
        <div key={i} className="signals-overlay-row">
          <span className="signals-overlay-type">{s.type}</span>
          <span className="signals-overlay-node">{s.nodeId.slice(0, 16)}</span>
          <span className="signals-overlay-time">
            {new Date(s.timestamp).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
}
