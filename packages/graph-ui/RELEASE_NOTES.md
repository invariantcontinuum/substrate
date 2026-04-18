# Release Notes: v0.1.3

## Web Worker Architecture for Large-Scale Graph Rendering

This release fundamentally restructures the rendering engine to support smooth 60fps interaction at scale (target: up to 100K nodes). The monolithic WASM module has been split into two specialized modules communicating via zero-copy `Transferable` buffers.

### Architecture

```
Main Thread                          Web Worker
+--------------------------+         +---------------------------+
| RenderEngine (WASM)      |  <---   | WorkerEngine (WASM)       |
| - WebGL2 draw calls      |  Float  | - Graph data (nodes/edges)|
| - Frame-budgeted buffers |  32Arr  | - Force-directed layout   |
| - CPU spatial index      |  Transf | - Hierarchical layout     |
| - Theme application      |  erable | - Filter/spotlight logic  |
| - Pan/zoom/click         |         | - WebSocket connection    |
+--------------------------+         +---------------------------+
         ^                                    ^
         |                                    |
    React Graph                         worker.ts
    (orchestrator)                    (bootstrap + tick loop)
```

### What Changed for Consumers

**If you use the React `<Graph>` component** — no API changes required. The component signature is identical. The only breaking change is the `onReady` callback, which no longer receives an engine reference (signature changed from `(engine: any) => void` to `() => void`).

**If you use the WASM module directly** — the package entry point changed from `graph_wasm.js` to `graph_main_wasm.js`. The Worker module is available at the `./worker` export path. Direct WASM usage now requires coordinating both modules.

### Performance Improvements

| Metric | v0.1.1 | v0.1.3 |
|--------|--------|--------|
| Initial load (5K nodes) | UI frozen 2-5s | Progressive, interactive immediately |
| Layout animation | Blocks main thread per frame | Off-thread, zero-copy position updates |
| Node picking (hover/click) | Sync GPU readPixels (~2ms stall) | CPU spatial grid (~0.01ms) |
| Idle CPU after convergence | 60fps render loop running | 0fps, on-demand only |

### Known Limitations

- **Text labels**: Still using placeholder 1x1 atlas (no visible text rendering)
- **WebSocket**: Client structure exists but `connect_ws` handler is a stub — real-time updates not yet functional in this architecture
- **Progressive loading**: Snapshot is loaded atomically; chunked ingestion planned for next release
- **LOD**: No level-of-detail rendering at extreme zoom-out yet
- **Tab backgrounding**: No `visibilitychange` throttling yet

### Upgrade Path

```bash
# Update dependency
npm install @invariantcontinuum/graph@0.1.3

# No code changes needed if using the React component
import { Graph } from "@invariantcontinuum/graph/react";
```

If you were using `onReady` to access the engine directly, remove the parameter:
```diff
- onReady={(engine) => setEngine(engine)}
+ onReady={() => setReady(true)}
```
