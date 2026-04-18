# @invariantcontinuum/graph

WASM+WebGL2 graph visualization engine with Web Worker layout for large-scale knowledge graphs. Renders up to 100K nodes at 60fps by running force-directed layout off the main thread and transferring positions via zero-copy `Transferable` buffers.

## Installation

```bash
npm install @invariantcontinuum/graph
```

Requires a `.npmrc` pointing to GitHub Packages:

```
@invariantcontinuum:registry=https://npm.pkg.github.com
```

## Usage

### React Component

```tsx
import { Graph } from "@invariantcontinuum/graph/react";

function GraphPage() {
  return (
    <Graph
      snapshotUrl="/api/graph"
      wsUrl="wss://gateway.example.com"
      authToken={token}
      layout="force"
      filter={{ types: ["service", "database"] }}
      onNodeClick={(node) => console.log(node.id)}
      onStatsChange={(stats) => console.log(stats.nodeCount)}
      onReady={() => console.log("Engine ready")}
      className="w-full h-full"
    />
  );
}
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `snapshotUrl` | `string` | URL to fetch graph snapshot JSON |
| `wsUrl` | `string` | WebSocket base URL for real-time updates |
| `snapshot` | `GraphSnapshot` | Pass snapshot data directly (alternative to URL) |
| `authToken` | `string` | Auth token for WebSocket connection |
| `theme` | `Record<string, unknown>` | Theme configuration (node colors, sizes, shapes) |
| `layout` | `"force" \| "hierarchical"` | Layout algorithm (default: `"force"`) |
| `filter` | `GraphFilter \| null` | Filter visible nodes by type/domain/status |
| `onNodeClick` | `(node: NodeData) => void` | Called when a node is clicked |
| `onNodeHover` | `(node: NodeData \| null) => void` | Called on hover (null when hover ends) |
| `onStatsChange` | `(stats: GraphStats) => void` | Called when graph statistics change |
| `onReady` | `() => void` | Called when the engine is initialized |
| `spotlightIds` | `string[] \| null` | IDs to spotlight (dims all others) |
| `showCommunities` | `boolean` | Show community hull overlays |
| `className` | `string` | CSS class for the canvas container |
| `style` | `CSSProperties` | Inline styles for the canvas container |

### Snapshot Format

```typescript
interface GraphSnapshot {
  nodes: {
    id: string;
    name: string;
    type: string;      // "service" | "database" | "cache" | "external" | "policy" | "adr" | "incident"
    domain: string;
    status: string;    // "healthy" | "violation" | "warning" | "enforced"
    community?: number;
    meta: Record<string, unknown>;
  }[];
  edges: {
    id: string;
    source: string;
    target: string;
    type: string;      // "depends_on" | "calls" | "violation" | "enforces" | "drift"
    label: string;
    weight: number;
  }[];
  meta: {
    node_count: number;
    edge_count: number;
    last_updated?: string;
  };
}
```

## Architecture

The engine splits rendering across two WASM modules connected by a Web Worker:

```
Main Thread (graph-main-wasm)          Web Worker (graph-worker-wasm)
+-----------------------------+        +-----------------------------+
| WebGL2 instanced rendering  | <----  | Force-directed layout       |
| Frame-budgeted buffer ops   | Float  | Hierarchical layout         |
| CPU spatial grid (picking)  | 32Arr  | Graph data storage          |
| Camera (pan/zoom)           | Trans  | Filter/spotlight logic      |
| Theme application           | fable  | WebSocket ingestion         |
+-----------------------------+        +-----------------------------+
```

**Why this matters:** Force-directed layout with Barnes-Hut approximation is O(n log n) per tick. At 100K nodes, a single tick can take 50ms+ — more than an entire frame budget. By running layout in a Worker, the main thread stays free for rendering and interaction.

## Package Structure

```
pkg/
  graph_main_wasm.js / .wasm     Main-thread rendering engine
  graph_worker_wasm.js / .wasm   Worker-side layout engine
  react/
    Graph.tsx                    React component (orchestrator)
    worker.ts                    Worker bootstrap
    types.ts                     TypeScript type definitions
    index.ts                     Package exports
```

## Crate Architecture

| Crate | Role |
|-------|------|
| `graph-core` | Graph data structures, adjacency, filtering, algorithms, convex hull |
| `graph-layout` | Force-directed (Barnes-Hut), hierarchical, incremental placement |
| `graph-render` | WebGL2 renderers (nodes, edges, text, hulls), camera, theme, shaders |
| `graph-worker-wasm` | Worker WASM entry: layout engine, message dispatch, WebSocket |
| `graph-main-wasm` | Main thread WASM entry: render engine, spatial index, interaction |

## Known Limitations (v0.1.x)

- **Text labels**: SDF text pipeline uses a placeholder atlas — labels do not render yet
- **WebGL2 only**: No WebGPU backend
- **No accessibility**: Keyboard navigation and screen reader support not available

## Development

Requires `wasm-pack` and a Rust nightly toolchain with `wasm32-unknown-unknown` target.

```bash
# Build both WASM targets
wasm-pack build --target web --out-dir ../../pkg crates/graph-worker-wasm --out-name graph_worker_wasm
wasm-pack build --target web --out-dir ../../pkg-main crates/graph-main-wasm --out-name graph_main_wasm
cp pkg-main/graph_main_wasm* pkg/ && rm -rf pkg-main

# Run tests
cargo test --workspace

# Run benchmarks
cargo bench -p graph-layout
```

## License

MIT
