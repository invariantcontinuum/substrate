use wasm_bindgen::prelude::*;
use web_sys::HtmlCanvasElement;

use graph_render::arrows::{ARROW_INSTANCE_FLOATS, ArrowRenderer};
use graph_render::camera::Camera;
use graph_render::context::RenderContext;
use graph_render::edges::{EDGE_INSTANCE_FLOATS, EdgeRenderer};
use graph_render::hulls::HullRenderer;
use graph_render::nodes::{NODE_INSTANCE_FLOATS, NodeRenderer};
use graph_render::text::TextRenderer;
use graph_render::theme::{ThemeConfig, parse_hex_color, shape_index};

use crate::pulse::PulseState;
use crate::spatial::SpatialGrid;

const DEFAULT_THEME_JSON: &str = include_str!("default_theme.json");

/// Safe fallback bounding half-extent used when node metadata is absent.
/// Also the minimum coarse lookup radius for the spatial hit test.
const DEFAULT_HALF_EXTENT: f32 = 20.0;

#[derive(Debug, Clone)]
pub struct NodeMeta {
    pub node_type: String,
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct ResolvedNodeStyle {
    pub half_w: f32,
    pub half_h: f32,
    pub color: [f32; 4],
    pub border_color: [f32; 4],
    pub border_width: f32,
    pub shape: f32,
    pub flags: u32,
}

/// Categorical-12 palette for community hull coloring.
#[allow(dead_code)]
const PALETTE: &[(f32, f32, f32)] = &[
    (0.35, 0.65, 1.0),
    (1.0, 0.45, 0.35),
    (0.35, 0.85, 0.55),
    (0.95, 0.75, 0.25),
    (0.65, 0.45, 0.95),
    (1.0, 0.55, 0.75),
    (0.45, 0.85, 0.85),
    (0.85, 0.55, 0.35),
    (0.55, 0.75, 0.35),
    (0.75, 0.35, 0.55),
    (0.35, 0.55, 0.75),
    (0.85, 0.85, 0.35),
];

#[wasm_bindgen]
pub struct RenderEngine {
    ctx: RenderContext,
    camera: Camera,
    theme: ThemeConfig,

    // Renderers
    node_renderer: NodeRenderer,
    edge_renderer: EdgeRenderer,
    arrow_renderer: ArrowRenderer,
    text_renderer: TextRenderer,
    hull_renderer: HullRenderer,

    // Current data from worker
    positions: Vec<f32>,
    visual_flags: Vec<u8>,
    edge_data: Vec<f32>,
    edge_count: usize,
    node_ids: Vec<String>,
    node_metadata: std::collections::HashMap<String, NodeMeta>,
    edge_metadata: std::collections::HashMap<String, String>, // edge_id -> edge_type

    // Spatial index
    spatial: SpatialGrid,

    /// Cached (half_w, half_h) per node, index-aligned with `node_ids`.
    /// Rebuilt in `set_node_metadata` and `set_theme`. Used by `hit_test_node`
    /// to avoid repeated theme resolution on the hover/click hot path.
    node_half_dims: Vec<(f32, f32)>,
    /// Cached worst-case bounding dimension across all nodes (max of max(hw, hh)).
    /// Used as the coarse spatial-grid lookup radius.
    cached_max_bound: f32,

    // Interaction state
    hovered_idx: Option<usize>,
    selected_idx: Option<usize>,
    show_hulls: bool,

    // Panning state
    is_panning: bool,
    last_mouse_x: f32,
    last_mouse_y: f32,

    // Drag state
    is_dragging_node: bool,
    dragged_idx: Option<usize>,
    pending_worker_messages: Vec<serde_json::Value>,

    // Animation
    start_time: f64,
    camera_anim: Option<crate::camera_anim::CameraAnim>,
    pulse: PulseState,
    buffers_dirty: bool,
    needs_render: bool,

    // Frame budget tracking
    budget_overruns: u32,

    // Per-frame JS subscribers (e.g., Canvas2D label overlay).
    // Invoked at the end of each `frame()` tick with `{positions, vpMatrix}`.
    frame_subscribers: Vec<js_sys::Function>,
}

#[wasm_bindgen]
impl RenderEngine {
    #[wasm_bindgen(constructor)]
    pub fn create(canvas: HtmlCanvasElement) -> Result<RenderEngine, JsValue> {
        let ctx = RenderContext::new(canvas).map_err(|e| JsValue::from_str(&e))?;
        let camera = Camera::new(ctx.width as f32, ctx.height as f32);
        let theme: ThemeConfig = serde_json::from_str(DEFAULT_THEME_JSON)
            .map_err(|e| JsValue::from_str(&format!("Theme parse: {e}")))?;

        let node_renderer = NodeRenderer::new(&ctx).map_err(|e| JsValue::from_str(&e))?;
        let edge_renderer = EdgeRenderer::new(&ctx).map_err(|e| JsValue::from_str(&e))?;
        let arrow_renderer = ArrowRenderer::new(&ctx).map_err(|e| JsValue::from_str(&e))?;
        let text_renderer = TextRenderer::new(&ctx).map_err(|e| JsValue::from_str(&e))?;
        let hull_renderer = HullRenderer::new(&ctx).map_err(|e| JsValue::from_str(&e))?;

        Ok(Self {
            ctx,
            camera,
            theme,
            node_renderer,
            edge_renderer,
            arrow_renderer,
            text_renderer,
            hull_renderer,
            positions: Vec::new(),
            visual_flags: Vec::new(),
            edge_data: Vec::new(),
            edge_count: 0,
            node_ids: Vec::new(),
            node_metadata: std::collections::HashMap::new(),
            edge_metadata: std::collections::HashMap::new(),
            spatial: SpatialGrid::new(),
            node_half_dims: Vec::new(),
            cached_max_bound: DEFAULT_HALF_EXTENT,
            hovered_idx: None,
            selected_idx: None,
            show_hulls: false,
            is_panning: false,
            last_mouse_x: 0.0,
            last_mouse_y: 0.0,
            is_dragging_node: false,
            dragged_idx: None,
            pending_worker_messages: Vec::new(),
            start_time: 0.0,
            camera_anim: None,
            pulse: PulseState::new(Self::current_time_ms()),
            buffers_dirty: true,
            needs_render: true,
            budget_overruns: 0,
            frame_subscribers: Vec::new(),
        })
    }

    // --- Data updates from worker ---

    pub fn update_positions(&mut self, positions: &[f32], flags: &[u8]) {
        self.positions = positions.to_vec();
        self.visual_flags = flags.to_vec();
        self.buffers_dirty = true;
        self.needs_render = true;
        // Do not remove — spatial.rebuild is the invariant that handle_click / handle_hover
        // depend on. Tests: crates/graph-main-wasm/tests/spatial_index.rs
        self.spatial.rebuild(&self.positions, 200);
        self.update_min_zoom();
    }

    pub fn update_edges(&mut self, edge_data: &[f32], edge_count: usize) {
        self.edge_data = edge_data.to_vec();
        self.edge_count = edge_count;
        self.buffers_dirty = true;
        self.needs_render = true;
    }

    pub fn set_node_ids(&mut self, ids: Vec<String>) {
        self.node_ids = ids;
    }

    pub fn set_node_metadata(
        &mut self,
        ids_js: JsValue,
        types_js: JsValue,
        statuses_js: JsValue,
    ) -> Result<(), JsValue> {
        let ids: Vec<String> = serde_wasm_bindgen::from_value(ids_js)
            .map_err(|e| JsValue::from_str(&format!("ids: {e}")))?;
        let types: Vec<String> = serde_wasm_bindgen::from_value(types_js)
            .map_err(|e| JsValue::from_str(&format!("types: {e}")))?;
        let statuses: Vec<String> = serde_wasm_bindgen::from_value(statuses_js)
            .map_err(|e| JsValue::from_str(&format!("statuses: {e}")))?;
        // Keep node_ids in sync so hit-testing (click/drag/focus) never silently
        // fails because the ids vec is empty or stale. This merges the old
        // set_node_ids call into set_node_metadata so callers can't forget it.
        self.node_ids = ids.clone();
        self.node_metadata.clear();
        for (i, id) in ids.iter().enumerate() {
            self.node_metadata.insert(
                id.clone(),
                NodeMeta {
                    node_type: types.get(i).cloned().unwrap_or_else(|| "service".into()),
                    status: statuses.get(i).cloned().unwrap_or_else(|| "healthy".into()),
                },
            );
        }
        self.rebuild_hit_test_cache();
        self.recompute_pulse();
        self.buffers_dirty = true;
        Ok(())
    }

    pub fn set_edge_metadata(&mut self, ids_js: JsValue, types_js: JsValue) -> Result<(), JsValue> {
        let ids: Vec<String> = serde_wasm_bindgen::from_value(ids_js)
            .map_err(|e| JsValue::from_str(&format!("ids: {e}")))?;
        let types: Vec<String> = serde_wasm_bindgen::from_value(types_js)
            .map_err(|e| JsValue::from_str(&format!("types: {e}")))?;
        self.edge_metadata.clear();
        for (i, id) in ids.iter().enumerate() {
            self.edge_metadata.insert(
                id.clone(),
                types.get(i).cloned().unwrap_or_else(|| "depends".into()),
            );
        }
        Ok(())
    }

    pub fn get_legend(&self) -> JsValue {
        use std::collections::HashMap;
        let mut node_counts: HashMap<String, usize> = HashMap::new();
        let mut edge_counts: HashMap<String, usize> = HashMap::new();

        for meta in self.node_metadata.values() {
            *node_counts.entry(meta.node_type.clone()).or_insert(0) += 1;
        }
        for etype in self.edge_metadata.values() {
            *edge_counts.entry(etype.clone()).or_insert(0) += 1;
        }

        let mut summary =
            graph_core::graph::GraphStore::legend_summary_from_counts(&node_counts, &edge_counts);

        // Populate node style fields from theme.
        for entry in &mut summary.node_types {
            let override_ = self.theme.nodes.by_type.get(&entry.type_key);
            entry.shape = override_
                .and_then(|o| o.shape.clone())
                .unwrap_or_else(|| self.theme.nodes.default.shape.clone());
            entry.color = override_
                .and_then(|o| o.color.clone())
                .unwrap_or_else(|| self.theme.nodes.default.color.clone());
            entry.border_color = override_
                .and_then(|o| o.border_color.clone())
                .unwrap_or_else(|| self.theme.nodes.default.border_color.clone());
        }
        // Populate edge style fields from theme.
        for entry in &mut summary.edge_types {
            let override_ = self.theme.edges.by_type.get(&entry.type_key);
            entry.color = override_
                .and_then(|o| o.color.clone())
                .unwrap_or_else(|| self.theme.edges.default.color.clone());
            entry.dash = override_.and_then(|o| o.style.clone());
        }

        serde_wasm_bindgen::to_value(&summary).unwrap_or(JsValue::NULL)
    }

    // --- Configuration ---

    pub fn set_theme(&mut self, theme_js: &JsValue) -> Result<(), JsValue> {
        let theme: ThemeConfig = serde_wasm_bindgen::from_value(theme_js.clone())
            .map_err(|e| JsValue::from_str(&format!("{e}")))?;
        self.theme = theme;
        self.rebuild_hit_test_cache();
        self.recompute_pulse();
        self.buffers_dirty = true;
        self.needs_render = true;
        Ok(())
    }

    pub fn set_community_hulls(&mut self, show: bool) {
        self.show_hulls = show;
        self.buffers_dirty = true;
        self.needs_render = true;
    }

    // --- Interaction ---

    pub fn handle_click(&mut self, screen_x: f32, screen_y: f32) -> Option<String> {
        let (wx, wy) = self.camera.screen_to_world(screen_x, screen_y);
        let picked = self.hit_test_node(wx, wy);
        let picked_id = picked.and_then(|idx| self.node_ids.get(idx).cloned());
        // Click-to-spotlight is an engine invariant: selecting a node
        // immediately applies neighborhood dimming and selected styling.
        self.set_focus(picked_id.clone());
        picked_id
    }

    pub fn handle_hover(&mut self, screen_x: f32, screen_y: f32) -> Option<String> {
        let (wx, wy) = self.camera.screen_to_world(screen_x, screen_y);
        let picked = self.hit_test_node(wx, wy);

        if picked != self.hovered_idx {
            self.hovered_idx = picked;
            self.buffers_dirty = true;
            self.needs_render = true;
        }

        picked.and_then(|idx| self.node_ids.get(idx).cloned())
    }

    pub fn handle_pan_start(&mut self, x: f32, y: f32) {
        self.is_panning = true;
        self.last_mouse_x = x;
        self.last_mouse_y = y;
    }

    pub fn handle_pan_move(&mut self, x: f32, y: f32) {
        if self.is_panning {
            let dx = x - self.last_mouse_x;
            let dy = y - self.last_mouse_y;
            // World Y is up, screen Y is down. Flip dy so drag-down pans content down.
            self.camera.pan(dx, -dy);
            self.last_mouse_x = x;
            self.last_mouse_y = y;
            self.needs_render = true;
        }
    }

    pub fn handle_pan_end(&mut self) {
        self.is_panning = false;
    }

    pub fn handle_zoom(&mut self, delta: f32, _x: f32, _y: f32) {
        let factor = if delta > 0.0 { 0.96 } else { 1.04 };
        // Zoom anchored to viewport center so the graph stays centered
        // during wheel / pinch gestures. Pointer-relative zoom causes the
        // graph to drift off-screen with repeated zooms, which is the
        // stereotypical UX complaint this addresses.
        let cx = self.camera.viewport_width() * 0.5;
        let cy = self.camera.viewport_height() * 0.5;
        self.camera.zoom_at(factor, cx, cy);
        self.needs_render = true;
    }

    // --- Node drag ---

    /// Start dragging the node at the given screen coordinates.
    /// Returns the node id if a node was picked, otherwise None (caller should
    /// fall back to pan).
    pub fn handle_node_drag_start(&mut self, screen_x: f32, screen_y: f32) -> Option<String> {
        let (wx, wy) = self.camera.screen_to_world(screen_x, screen_y);
        let idx = self.hit_test_node(wx, wy)?;
        self.is_dragging_node = true;
        self.dragged_idx = Some(idx);
        let node_id = self.node_ids.get(idx).cloned();
        // Pin at the node's CURRENT position, not the click coordinates.
        // Clicking near the edge of a node should not teleport it to the
        // click point — only a real drag should change its position.
        let base = idx * 4;
        let (pin_x, pin_y) = if base + 1 < self.positions.len() {
            (self.positions[base], self.positions[base + 1])
        } else {
            (wx, wy)
        };
        // Queue a pin_node message — the React wrapper will pump this to the worker.
        self.pending_worker_messages.push(serde_json::json!({
            "type": "pin_node",
            "idx": idx,
            "x": pin_x,
            "y": pin_y,
        }));
        node_id
    }

    /// Update the currently-dragged node's position. No-op if no drag active.
    pub fn handle_node_drag_move(&mut self, screen_x: f32, screen_y: f32) {
        let Some(idx) = self.dragged_idx else {
            return;
        };
        let (wx, wy) = self.camera.screen_to_world(screen_x, screen_y);
        // Stride-4 positions buffer: x, y, radius_legacy, type_idx.
        let base = idx * 4;
        if base + 1 < self.positions.len() {
            self.positions[base] = wx;
            self.positions[base + 1] = wy;
        }
        self.buffers_dirty = true;
        self.needs_render = true;
        self.pending_worker_messages.push(serde_json::json!({
            "type": "pin_node",
            "idx": idx,
            "x": wx,
            "y": wy,
        }));
    }

    /// End the current drag. Queues an unpin message so the force layout reclaims
    /// the node.
    pub fn handle_node_drag_end(&mut self) {
        if let Some(idx) = self.dragged_idx.take() {
            self.pending_worker_messages.push(serde_json::json!({
                "type": "unpin_node",
                "idx": idx,
            }));
        }
        self.is_dragging_node = false;
    }

    /// Return (and clear) pending worker messages queued by drag handlers.
    /// The React wrapper calls this after each drag event and forwards the
    /// results via `worker.postMessage`.
    pub fn drain_worker_messages(&mut self) -> JsValue {
        let msgs = std::mem::take(&mut self.pending_worker_messages);
        serde_wasm_bindgen::to_value(&msgs).unwrap_or(JsValue::NULL)
    }

    // --- Main render frame ---

    pub fn frame(&mut self, timestamp: f64) -> bool {
        // --- Camera animation tick (runs before the early-return so every RAF
        //     drives the tween even when nothing else requested a render). ---
        if let Some(anim) = self.camera_anim {
            let ((cx, cy), z, done) = anim.sample(timestamp);
            self.camera.x = cx;
            self.camera.y = cy;
            self.camera.zoom = z.clamp(self.camera.min_zoom, self.camera.max_zoom);
            if done {
                self.camera_anim = None;
            }
            self.needs_render = true;
        }

        // Subscribers (e.g. LabelOverlay) need vpMatrix updates even when the
        // scene is static so labels track pan/zoom. Always notify before any
        // early return so late subscribers are never starved.
        let vp = self.camera.view_projection_matrix();
        self.notify_subscribers(&vp);

        if !self.needs_render {
            return false;
        }

        if self.start_time == 0.0 {
            self.start_time = timestamp;
        }
        let time = ((timestamp - self.start_time) / 1000.0) as f32;

        self.ctx.resize();
        self.camera
            .set_viewport(self.ctx.width as f32, self.ctx.height as f32);

        if self.buffers_dirty {
            let start = js_sys::Date::now();
            self.rebuild_buffers();
            let elapsed = js_sys::Date::now() - start;
            if elapsed > 8.0 {
                self.budget_overruns += 1;
            } else {
                self.budget_overruns = 0;
            }
            self.buffers_dirty = false;
        }

        let (br, bg, bb, ba) = parse_hex_color(&self.theme.background);
        self.ctx.clear(br, bg, bb, ba);

        self.hull_renderer.draw(&self.ctx.gl, &vp);
        self.edge_renderer.draw(&self.ctx.gl, &vp, time);
        self.arrow_renderer.draw(&self.ctx.gl, &vp);
        self.node_renderer.draw(&self.ctx.gl, &vp, time);
        self.text_renderer.draw(&self.ctx.gl, &vp);

        self.needs_render = false;
        // Keep the RAF loop alive every frame while pulse nodes are active so
        // the border-width animation updates continuously.
        if self.pulse.has_any() {
            self.needs_render = true;
            self.buffers_dirty = true;
        }
        true
    }

    /// Notify all frame subscribers with the current positions and VP matrix.
    ///
    /// SAFETY: `Float32Array::view` borrows from the WASM linear memory.
    /// We do not mutate `self.positions` while the view is live (single-threaded,
    /// callbacks run synchronously and return before we resume). This is a
    /// zero-copy path vs. the old `Float32Array::from` which allocates + copies.
    fn notify_subscribers(&self, vp: &[f32; 16]) {
        if self.frame_subscribers.is_empty() || self.positions.is_empty() {
            return;
        }
        // Zero-copy views into the WASM memory buffer. Safe because we guarantee
        // the backing Vec is not reallocated for the duration of the callbacks.
        let positions_f32 = unsafe { js_sys::Float32Array::view(&self.positions) };
        let vp_f32 = unsafe { js_sys::Float32Array::view(&vp[..]) };
        let obj = js_sys::Object::new();
        let _ = js_sys::Reflect::set(&obj, &"positions".into(), &positions_f32);
        let _ = js_sys::Reflect::set(&obj, &"vpMatrix".into(), &vp_f32);
        for cb in &self.frame_subscribers {
            let _ = cb.call1(&wasm_bindgen::JsValue::NULL, &obj);
        }
    }

    pub fn needs_frame(&self) -> bool {
        self.needs_render
    }

    pub fn request_render(&mut self) {
        self.needs_render = true;
    }

    // --- Camera animation helpers ---

    fn current_time_ms() -> f64 {
        web_sys::window().unwrap().performance().unwrap().now()
    }

    pub(crate) fn start_camera_anim(
        &mut self,
        to_center: (f32, f32),
        to_zoom: f32,
        duration_ms: f64,
    ) {
        let from_center = (self.camera.x, self.camera.y);
        let from_zoom = self.camera.zoom;
        self.camera_anim = Some(crate::camera_anim::CameraAnim::new(
            (from_center, from_zoom),
            (to_center, to_zoom),
            Self::current_time_ms(),
            duration_ms,
        ));
        self.needs_render = true;
    }

    // --- T4: Camera fit / zoom / focus / recovery / frame subscription ---

    /// Compute the AABB of current node positions and snap the camera to it.
    /// Called from JS after every `update_positions` + layout settlement.
    /// NOTE: this is a snap (immediate write), not animated — only `focus_fit`
    /// uses the animated camera tween.
    pub fn fit(&mut self, padding_px: f32) {
        let all: Vec<usize> = (0..self.positions.len() / 4).collect();
        if let Some(((cx, cy), zoom)) = self.compute_fit_viewport(padding_px, &all) {
            self.camera.x = cx;
            self.camera.y = cy;
            self.camera.zoom = zoom;
            self.update_min_zoom();
            self.needs_render = true;
        }
    }

    /// Multiplicative zoom around screen center.
    pub fn zoom_in(&mut self) {
        let cx = self.camera.viewport_width() * 0.5;
        let cy = self.camera.viewport_height() * 0.5;
        self.camera.zoom_at(1.04, cx, cy);
        self.needs_render = true;
    }

    pub fn zoom_out(&mut self) {
        let cx = self.camera.viewport_width() * 0.5;
        let cy = self.camera.viewport_height() * 0.5;
        self.camera.zoom_at(0.96, cx, cy);
        self.needs_render = true;
    }

    /// Focus a node: dim every non-neighbor via `visual_flags` (bit 0 = dimmed).
    /// `None` clears the focus.
    ///
    /// NOTE on data layout: the plan spec assumed `edge_data` stride-4 with
    /// `[source_idx, target_idx, ...]`, but the actual worker layout is stride-6
    /// `[sx, sy, tx, ty, type_idx, weight]` in world coordinates (see
    /// `graph-worker-wasm::engine::get_edge_buffer`). We therefore resolve
    /// source/target node indices by matching edge endpoint coordinates to
    /// `self.positions`. This is semantically equivalent — the coordinates came
    /// from the same `positions` map — and avoids a worker-side schema change.
    ///
    /// NOTE on coordinate keying: we key the position→index map by
    /// `(x.to_bits(), y.to_bits())` rather than rounded integers. f32 values
    /// transit through the worker boundary bit-identical — Float32Array
    /// preserves exact bits — so bit-for-bit matching is correct and
    /// collision-free. Rounded-integer keys would silently collide for any
    /// two nodes whose positions round to the same integer pair (realistic
    /// at sub-pixel separation during layout convergence), dropping one of
    /// them from the lookup. Bit keys only collide when two nodes occupy the
    /// exact same f32 position — a genuine overlap, not an aliasing artifact.
    ///
    /// NOTE on `visual_flags` semantics: the existing renderer treats the whole
    /// byte as `== 1` for "dimmed" (see `rebuild_buffers` ~line 584). Since we
    /// only use bit 0 here (values end up 0 or 1), this matches the renderer's
    /// current check. If additional bits are ever added to `visual_flags`, the
    /// renderer's `== 1` comparison must be upgraded to a `& 1` bit test.
    pub fn set_focus(&mut self, id: Option<String>) {
        use crate::spotlight::{build_coord_index, neighborhood_indices, apply_dim_bits, clear_dim_bits};

        let Some(id) = id else {
            self.selected_idx = None;
            clear_dim_bits(&mut self.visual_flags);
            self.buffers_dirty = true;
            self.needs_render = true;
            return;
        };
        let Some(focus_idx) = self.node_ids.iter().position(|n| n == &id) else {
            self.selected_idx = None;
            clear_dim_bits(&mut self.visual_flags);
            self.buffers_dirty = true;
            self.needs_render = true;
            return;
        };
        self.selected_idx = Some(focus_idx);

        let coord_to_idx = build_coord_index(&self.positions);
        let keep = neighborhood_indices(focus_idx, &self.edge_data, &coord_to_idx);
        let node_count = self.positions.len() / 4;
        apply_dim_bits(&mut self.visual_flags, node_count, &keep);

        self.buffers_dirty = true;
        self.needs_render = true;
    }

    /// Focus a node AND animate the camera to frame its 1-hop neighborhood over 400 ms.
    /// When `id` is `None`, clears focus and animates to fit all nodes.
    pub fn focus_fit(&mut self, id: Option<String>, padding_px: f32) {
        // Reuse set_focus to dim non-neighbors (already handles None for clear).
        self.set_focus(id.clone());

        if id.is_none() {
            // Fit-to-all, animated.
            let all: Vec<usize> = (0..self.positions.len() / 4).collect();
            if all.is_empty() {
                return;
            }
            if let Some((center, zoom)) = self.compute_fit_viewport(padding_px, &all) {
                self.start_camera_anim(center, zoom, 400.0);
            }
            return;
        }

        let indices = self.neighbor_indices_of_selected();
        if indices.is_empty() {
            return;
        }
        if let Some((center, zoom)) = self.compute_fit_viewport(padding_px, &indices) {
            self.start_camera_anim(center, zoom, 400.0);
        }
    }

    /// Compute the target center and zoom level needed to frame the given node indices
    /// inside the current viewport (with `padding_px` inset on all sides).
    /// Returns `None` when the AABB is degenerate (no valid positions in `indices`).
    fn compute_fit_viewport(
        &self,
        padding_px: f32,
        indices: &[usize],
    ) -> Option<((f32, f32), f32)> {
        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        for &i in indices {
            let off = i * 4;
            if off + 2 >= self.positions.len() {
                continue;
            }
            let x = self.positions[off];
            let y = self.positions[off + 1];
            let r = self.positions[off + 2];
            if x - r < min_x { min_x = x - r; }
            if x + r > max_x { max_x = x + r; }
            if y - r < min_y { min_y = y - r; }
            if y + r > max_y { max_y = y + r; }
        }
        if !min_x.is_finite() {
            return None;
        }
        let cx = (min_x + max_x) * 0.5;
        let cy = (min_y + max_y) * 0.5;
        let graph_w = (max_x - min_x).max(f32::EPSILON);
        let graph_h = (max_y - min_y).max(f32::EPSILON);
        let scale_x = (self.camera.viewport_width() - 2.0 * padding_px).max(1.0) / graph_w;
        let scale_y = (self.camera.viewport_height() - 2.0 * padding_px).max(1.0) / graph_h;
        let zoom = scale_x
            .min(scale_y)
            .clamp(self.camera.min_zoom, self.camera.max_zoom);
        Some(((cx, cy), zoom))
    }

    /// Collect all node indices in the 1-hop closed neighborhood of `self.selected_idx`.
    /// Returns an empty vec if nothing is selected.
    fn neighbor_indices_of_selected(&self) -> Vec<usize> {
        let Some(focus_idx) = self.selected_idx else {
            return Vec::new();
        };
        let coord_to_idx = crate::spotlight::build_coord_index(&self.positions);
        let keep = crate::spotlight::neighborhood_indices(focus_idx, &self.edge_data, &coord_to_idx);
        keep.into_iter().collect()
    }

    /// Recompute `camera.min_zoom` so the user cannot zoom out past the
    /// rendered graph into empty background. The floor is set to 70% of the
    /// zoom level that would make the graph exactly fill the viewport.
    fn update_min_zoom(&mut self) {
        if self.positions.is_empty() {
            return;
        }
        let vw = self.camera.viewport_width();
        let vh = self.camera.viewport_height();
        if vw < 1.0 || vh < 1.0 {
            return;
        }
        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        for chunk in self.positions.chunks_exact(4) {
            let (x, y, r) = (chunk[0], chunk[1], chunk[2]);
            min_x = min_x.min(x - r);
            min_y = min_y.min(y - r);
            max_x = max_x.max(x + r);
            max_y = max_y.max(y + r);
        }
        let graph_w = (max_x - min_x).max(f32::EPSILON);
        let graph_h = (max_y - min_y).max(f32::EPSILON);
        let scale_x = vw / graph_w;
        let scale_y = vh / graph_h;
        let fit_zoom = scale_x.min(scale_y);
        // Allow zooming out to 70% of "exact fit" — enough to see a little
        // surrounding context, but not enough to lose the graph in empty space.
        self.camera.min_zoom = (fit_zoom * 0.7).clamp(0.01, self.camera.max_zoom);
    }

    /// Re-upload GPU buffers after a WebGL context loss → restore sequence.
    pub fn rehydrate(&mut self) {
        self.buffers_dirty = true;
        self.needs_render = true;
    }

    /// Subscribe to per-frame position+camera updates (for the Canvas2D label overlay).
    /// Callback invoked once per `frame()` tick with `{positions: Float32Array, vpMatrix: Float32Array}`.
    pub fn subscribe_frame(&mut self, cb: js_sys::Function) {
        self.frame_subscribers.push(cb);
        // Immediate synchronous callback so late subscribers (e.g. LabelOverlay
        // mounting after grid convergence) receive the current state instead of
        // waiting for the next render frame that may never come.
        let vp = self.camera.view_projection_matrix();
        self.notify_subscribers(&vp);
    }
}

// --- Private ---

impl RenderEngine {
    /// Resolve effective per-node style from theme: default + type override + status override.
    /// Returns a struct with named fields instead of a positional tuple.
    fn resolved_node_style(&self, node_type: &str, status: &str) -> ResolvedNodeStyle {
        let default = &self.theme.nodes.default;
        let type_override = self.theme.nodes.by_type.get(node_type);
        let status_override = self.theme.nodes.by_status.get(status);

        let shape_name = type_override
            .and_then(|o| o.shape.clone())
            .unwrap_or_else(|| default.shape.clone());
        let shape = shape_index(&shape_name);

        let half_w = type_override
            .and_then(|o| o.half_width)
            .or(default.half_width)
            .unwrap_or(default.size);
        let half_h = type_override
            .and_then(|o| o.half_height)
            .or(default.half_height)
            .unwrap_or(default.size);

        let color_hex = type_override
            .and_then(|o| o.color.clone())
            .unwrap_or_else(|| default.color.clone());
        let (cr, cg, cb, ca) = parse_hex_color(&color_hex);
        let color = [cr, cg, cb, ca];

        let border_color_hex = status_override
            .and_then(|o| o.border_color.clone())
            .or_else(|| type_override.and_then(|o| o.border_color.clone()))
            .unwrap_or_else(|| default.border_color.clone());
        let (br, bg, bb, ba) = parse_hex_color(&border_color_hex);
        let border_color = [br, bg, bb, ba];

        let border_width = status_override
            .and_then(|o| o.border_width)
            .or_else(|| type_override.and_then(|o| o.border_width))
            .unwrap_or(default.border_width);

        let mut flags: u32 = 0;
        if status_override.map(|o| o.pulse).unwrap_or(false) {
            flags |= 1; // bit 0 = pulse
        }

        ResolvedNodeStyle {
            half_w,
            half_h,
            color,
            border_color,
            border_width,
            shape,
            flags,
        }
    }

    /// Rebuild `pulse_indices` from `node_ids` order + theme byStatus.pulse map.
    /// Must be called whenever `node_metadata` or `theme` changes.
    fn recompute_pulse(&mut self) {
        // Build a String→bool map from theme.nodes.by_status where pulse == true.
        let status_pulse: std::collections::HashMap<String, bool> = self
            .theme
            .nodes
            .by_status
            .iter()
            .filter(|(_, v)| v.pulse)
            .map(|(k, _)| (k.clone(), true))
            .collect();
        // Collect statuses in node_ids order so pulse_indices align with i in rebuild_buffers.
        let node_statuses: Vec<String> = self
            .node_ids
            .iter()
            .map(|id| {
                self.node_metadata
                    .get(id)
                    .map(|m| m.status.clone())
                    .unwrap_or_else(|| "healthy".to_string())
            })
            .collect();
        self.pulse.recompute(&node_statuses, &status_pulse);
    }

    /// Rebuild the cached per-node half-dimensions used by `hit_test_node`.
    /// Called whenever node_metadata or the theme changes so the hot path
    /// (hover/click) does not need to resolve styles.
    fn rebuild_hit_test_cache(&mut self) {
        self.node_half_dims.clear();
        self.node_half_dims.reserve(self.node_ids.len());
        let mut max_bound = 0.0_f32;
        for id in &self.node_ids {
            let (hw, hh) = match self.node_metadata.get(id) {
                Some(meta) => {
                    let style = self.resolved_node_style(&meta.node_type, &meta.status);
                    (style.half_w, style.half_h)
                }
                None => (DEFAULT_HALF_EXTENT, DEFAULT_HALF_EXTENT),
            };
            self.node_half_dims.push((hw, hh));
            let bound = hw.max(hh);
            if bound > max_bound {
                max_bound = bound;
            }
        }
        self.cached_max_bound = max_bound.max(DEFAULT_HALF_EXTENT);
    }

    /// Coarse-then-fine node picking: uses the spatial grid for a candidate list,
    /// then performs a per-node AABB check using cached half_w / half_h.
    fn hit_test_node(&self, world_x: f32, world_y: f32) -> Option<usize> {
        // Use the cached worst-case bound as the coarse spatial-grid radius.
        let max_bound = self.cached_max_bound;
        let candidates = self.spatial.candidates_within(world_x, world_y, max_bound);

        for idx in candidates {
            if idx * 4 + 1 >= self.positions.len() {
                continue;
            }
            let cx = self.positions[idx * 4];
            let cy = self.positions[idx * 4 + 1];

            // Use cached half-dims if available; otherwise fall back to DEFAULT_HALF_EXTENT.
            let (hw, hh) = self
                .node_half_dims
                .get(idx)
                .copied()
                .unwrap_or((DEFAULT_HALF_EXTENT, DEFAULT_HALF_EXTENT));

            if (world_x - cx).abs() <= hw && (world_y - cy).abs() <= hh {
                return Some(idx);
            }
        }
        None
    }

    /// Map a theme edge style string to the `v_dash` mode integer consumed by `edge.frag`.
    /// 0 = solid, 1 = dashed, 2 = short-dashed, 3 = dotted.
    fn edge_dash_mode(style: &str) -> f32 {
        match style {
            "dashed" => 1.0,
            "short-dashed" => 2.0,
            "dotted" => 3.0,
            _ => 0.0, // solid
        }
    }

    fn rebuild_buffers(&mut self) {
        let gl = &self.ctx.gl;
        let node_count = self.positions.len() / 4;
        let now_ms = Self::current_time_ms();

        // --- Node buffer ---
        let mut node_data = Vec::with_capacity(node_count * NODE_INSTANCE_FLOATS);

        for i in 0..node_count {
            let cx = self.positions[i * 4];
            let cy = self.positions[i * 4 + 1];
            let type_idx = self.positions[i * 4 + 3] as usize;
            let is_dimmed = self.visual_flags.get(i).copied().unwrap_or(0) == 1;

            // Prefer node_metadata lookup; fall back to type_idx from position buffer.
            let (node_type, status) = self
                .node_ids
                .get(i)
                .and_then(|id| self.node_metadata.get(id))
                .map(|m| (m.node_type.as_str(), m.status.as_str()))
                .unwrap_or_else(|| {
                    let t = match type_idx {
                        0 => "service",
                        1 => "database",
                        2 => "cache",
                        3 => "external",
                        4 => "policy",
                        5 => "adr",
                        6 => "incident",
                        _ => "service",
                    };
                    (t, "healthy")
                });

            let style = self.resolved_node_style(node_type, status);
            let mut flags: u32 = style.flags;
            let mut border_color = style.border_color;
            let pulse_mult = self.pulse.border_multiplier(i, now_ms);
            let mut border_width = style.border_width * pulse_mult;
            let mut half_w = style.half_w;
            let mut half_h = style.half_h;

            let is_hovered = self.hovered_idx == Some(i);
            let is_selected = self.selected_idx == Some(i);

            // Hovered: bit 1 of flags (additive with pulse bit 0)
            if is_hovered {
                flags |= 2; // bit 1 = hovered
            }
            // Selected: apply focus styling per §6 visual rules.
            // - borderColor := theme.interaction.select.borderColor
            // - borderWidth += 1.5 (additive over base style)
            // - halfWidth *= 1.08, halfHeight *= 1.08
            if is_selected {
                let sel_border = self.theme.interaction.select.border_color.clone();
                let (br, bg, bb, ba) = parse_hex_color(&sel_border);
                border_color = [br, bg, bb, ba];
                border_width += 1.5;
                half_w *= 1.08;
                half_h *= 1.08;
                flags |= 4; // bit 2 = selected
            }

            // Dimmed: bit 3 of flags — drives shader alpha, no Rust-side alpha multiplication.
            // Covers both spotlight dimming (visual_flags == 1) and hover dim-others.
            if is_dimmed || (self.hovered_idx.is_some() && !is_hovered && !is_selected) {
                flags |= 8; // bit 3 = dimmed
            }

            node_data.extend_from_slice(&[
                cx,
                cy,
                half_w,
                half_h,
                style.color[0],
                style.color[1],
                style.color[2],
                style.color[3],
                border_color[0],
                border_color[1],
                border_color[2],
                border_color[3],
                border_width,
                style.shape,
                flags as f32,
            ]);
        }
        self.node_renderer.upload(gl, &node_data, node_count);

        // --- Edge buffer ---
        // Each logical edge is tessellated into DEFAULT_SEGMENTS quadratic-bezier
        // sub-segments; the GPU sees N×logical_edges instances.
        use crate::bezier::{tessellate_quadratic, DEFAULT_BEND_RATIO, DEFAULT_SEGMENTS};
        let logical_edge_count = self.edge_count;
        let mut edge_buf =
            Vec::with_capacity(logical_edge_count * DEFAULT_SEGMENTS * EDGE_INSTANCE_FLOATS);
        let mut arrow_instances: Vec<f32> =
            Vec::with_capacity(logical_edge_count * ARROW_INSTANCE_FLOATS);
        let spotlight_idx = self.selected_idx;
        let spotlight_dim_opacity = self
            .theme
            .interaction
            .spotlight
            .dim_opacity
            .clamp(0.02, 1.0);
        // Build coord->idx map for edge focus checks using the spotlight helper.
        // Only pay the allocation cost when a node is actually focused.
        let coord_to_idx = if spotlight_idx.is_some() {
            crate::spotlight::build_coord_index(&self.positions)
        } else {
            std::collections::HashMap::new()
        };
        let edge_stride = 6;
        for i in 0..logical_edge_count {
            let base = i * edge_stride;
            if base + 5 >= self.edge_data.len() {
                break;
            }
            let sx = self.edge_data[base];
            let sy = self.edge_data[base + 1];
            let tx = self.edge_data[base + 2];
            let ty = self.edge_data[base + 3];
            let type_idx = self.edge_data[base + 4] as usize;
            let _weight = self.edge_data[base + 5];

            let type_name = match type_idx {
                0 => "DEPENDS_ON",
                1 => "CALLS",
                2 => "violation",
                3 => "enforces",
                4 => "drift",
                _ => "DEPENDS_ON",
            };

            let mut ecolor = self.theme.edges.default.color.clone();
            let mut ewidth = self.theme.edges.default.width;
            let mut dash = 0.0f32;
            let mut animate = 0.0f32;

            // T10: resolve edge style, color, width, and animate from theme per-type overrides.
            // The type_name is derived from the type_idx encoded in the edge_data buffer.
            // TODO(T19): when edge_metadata (id→type HashMap) lands, derive type_name from it
            //            instead of the positional type_idx encoding so arbitrary type strings work.
            if let Some(ov) = self.theme.edges.by_type.get(type_name) {
                if let Some(ref c) = ov.color {
                    ecolor = c.clone();
                }
                if let Some(ref w) = ov.width {
                    ewidth = *w;
                }
                if let Some(ref s) = ov.style {
                    dash = Self::edge_dash_mode(s);
                }
                if ov.animate {
                    animate = 1.0;
                }
            }

            let mut rendered_width = ewidth;
            let mut alpha_scale = 1.0f32;
            if let Some(focus_idx) = spotlight_idx {
                let s_idx = coord_to_idx.get(&(sx.to_bits(), sy.to_bits())).copied();
                let t_idx = coord_to_idx.get(&(tx.to_bits(), ty.to_bits())).copied();
                let is_focus_edge = s_idx == Some(focus_idx) || t_idx == Some(focus_idx);
                if is_focus_edge {
                    // §6 visual rule: focus edges get width *= 1.8
                    rendered_width = ewidth * 1.8;
                } else {
                    rendered_width = (ewidth * 0.75).max(0.5);
                    alpha_scale = spotlight_dim_opacity;
                }
            }

            let (er, eg, eb, ea0) = parse_hex_color(&ecolor);
            let ea = (ea0 * alpha_scale).clamp(0.0, 1.0);

            // Tessellate the logical edge into DEFAULT_SEGMENTS quadratic-bezier
            // sub-segments and emit one GPU instance per sub-segment.
            // NOTE: dash holds the dash-mode integer (0=solid, 1=dashed, …).
            //       Task 21 will overload this field with arc_start for continuous
            //       dash patterns; for now each segment restarts the dash — acceptable
            //       first-pass behaviour for pre-MVP.
            let p0 = (sx, sy);
            let p1 = (tx, ty);
            let segs = tessellate_quadratic(p0, p1, DEFAULT_BEND_RATIO, DEFAULT_SEGMENTS);
            for s in &segs {
                edge_buf.extend_from_slice(&[
                    s.from.0, s.from.1,
                    s.to.0,   s.to.1,
                    rendered_width,
                    er, eg, eb, ea,
                    dash,    // period/mode — Task 21 will replace with s.arc_start for continuity
                    animate,
                ]);
            }

            // T11: one arrow per logical edge (placed at full edge endpoints, not per segment).
            arrow_instances.extend_from_slice(&[
                sx, sy, tx, ty, 6.0, // arrow scale in world units
                er, eg, eb, ea,
            ]);
        }
        let gpu_edge_count = logical_edge_count * DEFAULT_SEGMENTS;
        let arrow_count = arrow_instances.len() / ARROW_INSTANCE_FLOATS;
        self.edge_renderer.upload(gl, &edge_buf, gpu_edge_count);
        self.arrow_renderer
            .upload(gl, &arrow_instances, arrow_count);

        // --- Hull buffer ---
        self.hull_renderer.upload(gl, &[], 0);

        // --- Text buffer ---
        self.text_renderer.upload(gl, &[], 0);
    }
}
