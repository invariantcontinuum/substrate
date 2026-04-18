# Changelog

All notable changes to `@invariantcontinuum/graph` will be documented in this file.

## [0.2.0] - 2026-04-12

### Breaking Changes
- **Node instance data layout:** 14 → 15 floats per instance. Added `halfWidth` and `halfHeight` attributes; removed single `radius` in favor of non-uniform sizing. Any direct consumer of `NodeRenderer::upload` must update to the new layout. substrate-platform consumers using the `<Graph>` React wrapper are unaffected.
- **Theme schema:** `NodeStyle` and `NodeStyleOverride` gained `halfWidth`, `halfHeight`, `cornerRadius` optional fields. Legacy `size: f32` is still honored as a fallback, so existing themes continue to parse.
- **Default theme:** Rewritten to match `invariantcontinuum/substrate-web`'s `ArchitectureGraph` stylesheet — `roundrectangle` default shape, `barrel` for databases, `diamond` for policies, per-type colors, violation pulse, dashed/dotted edge styles.

### Added
- **New SDF shapes:** `roundrectangle` (index 6) and `barrel` (index 7) in `node.frag`, matching Cytoscape's visual conventions.
- **Edge arrows:** Instanced triangle renderer (`ArrowRenderer`) draws arrowheads at every edge's target in a second pass, positioned after edges and before nodes in the draw order.
- **Dotted dash pattern:** `edge.frag` now supports `v_dash = 3` with a tight dotted pattern, wired from `theme.edges.byType.<name>.style = "dotted"`.
- **Violation pulse:** `status: "violation"` nodes oscillate their scale and border width in the vertex shader via `sin(u_time * 3.0)`, driven by a `pulse` bit in `a_flags`.
- **Node drag with layout pinning:** New engine API `handle_node_drag_start/move/end` plus `drain_worker_messages`. The force-layout worker gains `pin_node` / `unpin_node` messages and a `HashSet<usize>` of pinned indices whose positions are preserved across tick integrations. Edges track dragged nodes automatically via the positions buffer.
- **Dynamic legend extraction:** `graph-core::GraphStore::legend_summary_from_counts` returns a skeleton `LegendSummary`; `RenderEngine::get_legend` wraps it with theme-resolved styles and exposes it as a WASM export. The React wrapper adds `onLegendChange` prop and calls it after each `snapshot_loaded` worker message.
- **Empty snapshot clears canvas:** New `clear_snapshot` worker message wipes `store`, `search`, `positions`, `node_order`, `visual_flags`, `visible_nodes`, `spotlight_ids`, and `layout_running`. The React wrapper auto-sends it when an empty snapshot prop arrives.
- **CSS color parser:** `parse_css_color` accepts `#RRGGBB`, `#RRGGBBAA`, `rgb(r,g,b)`, and `rgba(r,g,b,a)` formats with a safe gray fallback. `parse_hex_color` is kept as a backward-compatible wrapper.
- **AABB hit test:** `SpatialGrid::candidates_within` returns coarse index candidates; `RenderEngine::hit_test_node` does per-node AABB fine-grained check using cached `(half_w, half_h)` pairs. Works correctly for wide rectangular nodes.
- **Per-node hit-test cache:** `RenderEngine.node_half_dims: Vec<(f32, f32)>` and `cached_max_bound: f32` make hover/click O(1) per candidate instead of iterating theme lookups. Rebuilt on `set_node_metadata` and `set_theme`.
- **Edge metadata:** `RenderEngine.edge_metadata: HashMap<String, String>` and `set_edge_metadata` WASM export. Used by `get_legend` to count edge types for the legend.
- **Node metadata:** `RenderEngine.node_metadata: HashMap<String, NodeMeta>` and `set_node_metadata` WASM export populated by the React wrapper before posting `load_snapshot` to the worker.
- **`ResolvedNodeStyle` struct:** Named-field replacement for the earlier 7-tuple return from `resolved_node_style`. Makes future extensions (e.g., adding arrow-start direction) non-breaking.

### Fixed
- **Wheel event isolation:** React's `onWheel` prop is passive since React 17, so `e.preventDefault()` was a no-op and ctrl+wheel leaked to the document. Replaced with a native `addEventListener('wheel', handler, { passive: false })` attached to the canvas inside a `useEffect`. Added `touchAction: 'none'` to the canvas inline style to stop touch-gesture bleed.
- **Shader dispatch fallback:** The fragment shader's shape dispatch now explicitly handles shape index 7 (`barrel`) and falls back to `sdf_circle` for unknown indices, rather than silently absorbing every out-of-range value into `sdf_barrel`.
- **Dimmed alpha duplication:** Removed the Rust-side `color[3] *= 0.15` multiplication that duplicated the fragment shader's `dimmed` branch. Dimming is now driven exclusively by the `flags` bit-field, which the shader reads via `mod(floor(v_flags/8.0), 2.0)`.
- **Flag bit manipulation:** Replaced the fragile `(flags as u32) & N == 0` guards in the node instance builder with straightforward `u32` bit ops, cast to `f32` only at the `extend_from_slice` boundary.

## [0.1.3] - 2026-04-10

### Added
- **Web Worker layout engine** (`graph-worker-wasm`): Force-directed and hierarchical layout computation runs entirely off the main thread, eliminating UI freezes during layout
- **Frame-budgeted rendering** (`graph-main-wasm`): Main-thread rendering operates within a strict 12ms frame budget with automatic overrun detection
- **CPU spatial index**: O(1) node picking via a flat grid replaces synchronous GPU `readPixels`, removing the main source of interaction jank
- **Transferable position buffers**: Worker-to-main-thread communication uses zero-copy `Float32Array` transfer via `postMessage` with `Transferable`
- **On-demand render loop**: After layout convergence, the render loop stops scheduling frames until new data arrives or the user interacts, dropping idle CPU to near zero
- **Worker bootstrap** (`react/worker.ts`): Dedicated Web Worker entry point with promise-guarded initialization preventing double-init race conditions
- **Edge data transfer**: Edge geometry is sent as a separate Transferable buffer on snapshot load, decoupled from per-tick position updates

### Changed
- **React `Graph` component rewritten**: Now orchestrates a Web Worker (layout) and main-thread WASM module (rendering) instead of a single monolithic engine
- **npm package exports**: Main entry is now `graph_main_wasm.js`; Worker module available at `./worker` export; React wrapper unchanged at `./react`
- **`onReady` callback signature**: Changed from `(engine: any) => void` to `() => void` — the engine is no longer directly exposed to consumers
- **CI pipeline**: Builds and publishes two WASM targets (worker + main) instead of one

### Removed
- **`graph-wasm` crate**: Replaced by `graph-worker-wasm` and `graph-main-wasm`
- **`useGraphEngine` hook**: Engine lifecycle is now managed internally by the `Graph` component
- **GPU pick buffer for interaction**: Replaced by CPU spatial grid (no more synchronous `gl.readPixels`)

## [0.1.1] - 2026-04-09

### Added
- Initial WASM+WebGL2 graph engine with force-directed and hierarchical layout
- React wrapper component (`Graph.tsx`)
- Node, edge, hull, and text renderers (text uses placeholder atlas)
- GPU-based color-ID picking for node interaction
- WebSocket support for real-time graph updates
- Barnes-Hut quadtree for O(n log n) force computation

## [0.1.0] - 2026-04-09

### Added
- Initial release with core graph data structures and rendering pipeline
