import { useRef, useState } from "react";

export function useGraphEngine() {
  const engineRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  return {
    engine: engineRef.current,
    ready,
    setEngine: (engine: any) => {
      engineRef.current = engine;
      setReady(true);
    },
  };
}
