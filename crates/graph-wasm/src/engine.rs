use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;
use web_sys::HtmlCanvasElement;

use graph_core::algorithms::{bfs_within, shortest_path};
use graph_core::filter::GraphFilter;
use graph_core::graph::GraphStore;
use graph_core::hull::compute_community_hulls;
use graph_core::search::SearchIndex;
use graph_core::types::{EdgeData, NodeData, NodeType, Status};

use graph_layout::{ForceLayout, HierarchicalLayout, LayoutEngine};

use graph_render::camera::Camera;
use graph_render::context::RenderContext;
use graph_render::edges::EdgeRenderer;
use graph_render::hulls::HullRenderer;
use graph_render::nodes::{NODE_INSTANCE_FLOATS, NodeRenderer};
use graph_render::picking::{PICK_INSTANCE_FLOATS, PickBuffer};
use graph_render::text::TextRenderer;
use graph_render::theme::{ThemeConfig, parse_hex_color, shape_index};

use crate::interop::{from_js_value, to_js_value};
use crate::websocket::WsClient;

const DEFAULT_THEME_JSON: &str = include_str!("default_theme.json");

/// Categorical-12 palette for community hull coloring.
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
pub struct GraphEngine {
    ctx: RenderContext,
    camera: Camera,
    theme: ThemeConfig,

    // Data
    store: GraphStore,
    search: SearchIndex,
    positions: HashMap<String, (f32, f32)>,
    node_order: Vec<String>,

    // Layout
    force_layout: ForceLayout,
    hier_layout: HierarchicalLayout,
    active_layout: LayoutKind,
    layout_running: bool,

    // Renderers
    node_renderer: NodeRenderer,
    edge_renderer: EdgeRenderer,
    text_renderer: TextRenderer,
    hull_renderer: HullRenderer,
    pick_buffer: PickBuffer,

    // Interaction state
    hovered_id: Option<String>,
    selected_id: Option<String>,
    spotlight_ids: HashSet<String>,
    show_hulls: bool,

    // Filter state
    visible_nodes: Option<HashSet<String>>,

    // WebSocket
    ws: Option<WsClient>,

    // Callbacks
    on_node_click: Option<js_sys::Function>,
    on_node_hover: Option<js_sys::Function>,
    on_stats_change: Option<js_sys::Function>,

    // Panning state
    is_panning: bool,
    last_mouse_x: f32,
    last_mouse_y: f32,

    // Start time for animation
    start_time: f64,
    buffers_dirty: bool,
}

#[derive(Clone, Copy, PartialEq)]
enum LayoutKind {
    Force,
    Hierarchical,
}

#[wasm_bindgen]
impl GraphEngine {
    #[wasm_bindgen(constructor)]
    pub fn create(canvas: HtmlCanvasElement) -> Result<GraphEngine, JsValue> {
        let ctx = RenderContext::new(canvas).map_err(|e| JsValue::from_str(&e))?;
        let camera = Camera::new(ctx.width as f32, ctx.height as f32);
        let theme: ThemeConfig = serde_json::from_str(DEFAULT_THEME_JSON)
            .map_err(|e| JsValue::from_str(&format!("Theme parse: {e}")))?;

        let node_renderer = NodeRenderer::new(&ctx).map_err(|e| JsValue::from_str(&e))?;
        let edge_renderer = EdgeRenderer::new(&ctx).map_err(|e| JsValue::from_str(&e))?;
        let text_renderer = TextRenderer::new(&ctx).map_err(|e| JsValue::from_str(&e))?;
        let hull_renderer = HullRenderer::new(&ctx).map_err(|e| JsValue::from_str(&e))?;
        let pick_buffer = PickBuffer::new(&ctx).map_err(|e| JsValue::from_str(&e))?;

        Ok(Self {
            ctx,
            camera,
            theme,
            store: GraphStore::new(),
            search: SearchIndex::new(),
            positions: HashMap::new(),
            node_order: Vec::new(),
            force_layout: ForceLayout::new(),
            hier_layout: HierarchicalLayout::new(),
            active_layout: LayoutKind::Force,
            layout_running: false,
            node_renderer,
            edge_renderer,
            text_renderer,
            hull_renderer,
            pick_buffer,
            hovered_id: None,
            selected_id: None,
            spotlight_ids: HashSet::new(),
            show_hulls: false,
            visible_nodes: None,
            ws: None,
            on_node_click: None,
            on_node_hover: None,
            on_stats_change: None,
            is_panning: false,
            last_mouse_x: 0.0,
            last_mouse_y: 0.0,
            start_time: 0.0,
            buffers_dirty: true,
        })
    }

    // --- Configuration ---

    pub fn set_theme(&mut self, theme_js: &JsValue) -> Result<(), JsValue> {
        let theme: ThemeConfig = from_js_value(theme_js).map_err(|e| JsValue::from_str(&e))?;
        self.theme = theme;
        self.buffers_dirty = true;
        Ok(())
    }

    pub fn set_layout(&mut self, layout: &str) {
        match layout {
            "hierarchical" => {
                self.active_layout = LayoutKind::Hierarchical;
                let result = self.hier_layout.compute(&self.store);
                for (id, x, y) in result {
                    self.positions.insert(id, (x, y));
                }
                self.layout_running = false;
            }
            _ => {
                self.active_layout = LayoutKind::Force;
                self.force_layout = ForceLayout::new();
                self.layout_running = true;
            }
        }
        self.buffers_dirty = true;
    }

    // --- Data loading ---

    pub fn load_snapshot(&mut self, snapshot_js: &JsValue) -> Result<(), JsValue> {
        let snapshot: Snapshot = from_js_value(snapshot_js).map_err(|e| JsValue::from_str(&e))?;

        self.store = GraphStore::new();
        self.search.clear();
        self.positions.clear();
        self.node_order.clear();

        for node in snapshot.nodes {
            self.search.insert(&node.id, &node.name);
            self.node_order.push(node.id.clone());
            self.store.add_node(node);
        }
        for edge in snapshot.edges {
            self.store.add_edge(edge);
        }

        // Run initial layout
        let result = match self.active_layout {
            LayoutKind::Force => {
                self.layout_running = true;
                self.force_layout = ForceLayout::new();
                self.force_layout.compute(&self.store)
            }
            LayoutKind::Hierarchical => {
                self.layout_running = false;
                self.hier_layout.compute(&self.store)
            }
        };
        for (id, x, y) in result {
            self.positions.insert(id, (x, y));
        }

        self.buffers_dirty = true;
        self.emit_stats();
        Ok(())
    }

    // --- WebSocket ---

    pub fn connect_websocket(&mut self, url: &str, token: &str) -> Result<(), JsValue> {
        let ws = WsClient::connect(url, token)?;
        self.ws = Some(ws);
        Ok(())
    }

    // --- Callbacks ---

    pub fn on(&mut self, event: &str, callback: js_sys::Function) {
        match event {
            "node_click" => self.on_node_click = Some(callback),
            "node_hover" => self.on_node_hover = Some(callback),
            "stats_change" => self.on_stats_change = Some(callback),
            _ => log::warn!("Unknown event: {}", event),
        }
    }

    // --- Filtering ---

    pub fn filter(&mut self, filter_js: &JsValue) -> Result<(), JsValue> {
        if filter_js.is_null() || filter_js.is_undefined() {
            self.visible_nodes = None;
        } else {
            let f: FilterInput = from_js_value(filter_js).map_err(|e| JsValue::from_str(&e))?;
            let core_filter = GraphFilter {
                types: f
                    .types
                    .map(|ts| ts.into_iter().filter_map(|t| parse_node_type(&t)).collect()),
                domains: f.domains,
                statuses: f
                    .statuses
                    .map(|ss| ss.into_iter().filter_map(|s| parse_status(&s)).collect()),
            };
            let ids = core_filter.apply(&self.store);
            self.visible_nodes = Some(ids.into_iter().collect());
        }
        self.buffers_dirty = true;
        Ok(())
    }

    // --- Spotlight ---

    pub fn spotlight(&mut self, ids_js: &JsValue) -> Result<(), JsValue> {
        if ids_js.is_null() || ids_js.is_undefined() {
            self.spotlight_ids.clear();
        } else {
            let ids: Vec<String> = from_js_value(ids_js).map_err(|e| JsValue::from_str(&e))?;
            self.spotlight_ids = ids.into_iter().collect();
        }
        self.buffers_dirty = true;
        Ok(())
    }

    // --- Graph queries ---

    pub fn expand_hops(&self, node_id: &str, hops: usize) -> Result<JsValue, JsValue> {
        let ids = bfs_within(&self.store, node_id, hops);
        to_js_value(&ids).map_err(|e| JsValue::from_str(&e))
    }

    pub fn find_path(&self, from_id: &str, to_id: &str) -> Result<JsValue, JsValue> {
        let path = shortest_path(&self.store, from_id, to_id);
        to_js_value(&path).map_err(|e| JsValue::from_str(&e))
    }

    pub fn get_neighbors(&self, node_id: &str) -> Result<JsValue, JsValue> {
        let neighbors: Vec<&NodeData> = self.store.neighbors(node_id);
        let ids: Vec<String> = neighbors.iter().map(|n| n.id.clone()).collect();
        to_js_value(&ids).map_err(|e| JsValue::from_str(&e))
    }

    pub fn get_stats(&self) -> Result<JsValue, JsValue> {
        let violation_count = self
            .store
            .nodes()
            .filter(|n| n.status == Status::Violation)
            .count();
        let stats = StatsOutput {
            node_count: self.store.node_count(),
            edge_count: self.store.edge_count(),
            violation_count,
            last_updated: chrono::Utc::now().to_rfc3339(),
        };
        to_js_value(&stats).map_err(|e| JsValue::from_str(&e))
    }

    pub fn set_community_hulls(&mut self, show: bool) {
        self.show_hulls = show;
        self.buffers_dirty = true;
    }

    // --- Mouse events (called from JS) ---

    pub fn handle_click(&mut self, x: f32, y: f32) {
        let vp = self.camera.view_projection_matrix();
        self.pick_buffer.draw(&self.ctx.gl, &vp);
        let px = x as i32;
        let py = y as i32;

        if let Some(idx) = self.pick_buffer.pick(&self.ctx.gl, px, py) {
            if idx < self.node_order.len() {
                let id = self.node_order[idx].clone();
                self.selected_id = Some(id.clone());
                self.buffers_dirty = true;
                if let Some(ref cb) = self.on_node_click
                    && let Some(node) = self.store.get_node(&id)
                    && let Ok(val) = to_js_value(node)
                {
                    let _ = cb.call1(&JsValue::NULL, &val);
                }
            }
        } else {
            self.selected_id = None;
            self.buffers_dirty = true;
        }
    }

    pub fn handle_hover(&mut self, x: f32, y: f32) {
        let vp = self.camera.view_projection_matrix();
        self.pick_buffer.draw(&self.ctx.gl, &vp);
        let px = x as i32;
        let py = y as i32;

        let new_hover = self
            .pick_buffer
            .pick(&self.ctx.gl, px, py)
            .and_then(|idx| self.node_order.get(idx).cloned());

        if new_hover != self.hovered_id {
            self.hovered_id = new_hover.clone();
            self.buffers_dirty = true;
            if let Some(ref cb) = self.on_node_hover {
                let val = match &new_hover {
                    Some(id) => {
                        if let Some(node) = self.store.get_node(id) {
                            to_js_value(node).unwrap_or(JsValue::NULL)
                        } else {
                            JsValue::NULL
                        }
                    }
                    None => JsValue::NULL,
                };
                let _ = cb.call1(&JsValue::NULL, &val);
            }
        }
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
            self.camera.pan(dx, dy);
            self.last_mouse_x = x;
            self.last_mouse_y = y;
            self.buffers_dirty = true;
        }
    }

    pub fn handle_pan_end(&mut self) {
        self.is_panning = false;
    }

    pub fn handle_zoom(&mut self, delta: f32, x: f32, y: f32) {
        let factor = if delta > 0.0 { 0.9 } else { 1.1 };
        self.camera.zoom_at(factor, x, y);
        self.buffers_dirty = true;
    }

    // --- Main render frame ---

    pub fn frame(&mut self, timestamp: f64) {
        if self.start_time == 0.0 {
            self.start_time = timestamp;
        }
        let time = ((timestamp - self.start_time) / 1000.0) as f32;

        // 1. Drain WS queue
        self.drain_ws();

        // 2. Layout tick
        if self.layout_running && self.active_layout == LayoutKind::Force {
            let still_moving = self.force_layout.tick(&self.store);
            if !still_moving {
                self.layout_running = false;
            }
            // Extract updated positions from force layout
            let result = self.force_layout.compute(&self.store);
            for (id, x, y) in result {
                self.positions.insert(id, (x, y));
            }
            self.buffers_dirty = true;
        }

        // 3. Resize check
        self.ctx.resize();
        self.camera
            .set_viewport(self.ctx.width as f32, self.ctx.height as f32);
        self.pick_buffer
            .resize(&self.ctx.gl, self.ctx.width, self.ctx.height);

        // 4. Rebuild GPU buffers if dirty
        if self.buffers_dirty {
            self.rebuild_buffers();
            self.buffers_dirty = false;
        }

        // 5. Clear and draw
        let (br, bg, bb, ba) = parse_hex_color(&self.theme.background);
        self.ctx.clear(br, bg, bb, ba);

        let vp = self.camera.view_projection_matrix();

        // Draw order: hulls -> edges -> nodes -> text
        self.hull_renderer.draw(&self.ctx.gl, &vp);
        self.edge_renderer.draw(&self.ctx.gl, &vp, time);
        self.node_renderer.draw(&self.ctx.gl, &vp, time);
        self.text_renderer.draw(&self.ctx.gl, &vp);
    }

    // --- Cleanup ---

    pub fn destroy(&mut self) {
        if let Some(ref ws) = self.ws {
            ws.close();
        }
        self.ws = None;
    }
}

// --- Private implementation ---

impl GraphEngine {
    fn drain_ws(&mut self) {
        // Drain all messages first to avoid double-borrow
        let mut messages = Vec::new();
        if let Some(ref mut ws) = self.ws {
            while let Some(msg) = ws.poll() {
                messages.push(msg);
            }
        }
        let mut any_changes = false;
        for msg in &messages {
            if self.process_ws_message(msg) {
                any_changes = true;
            }
        }
        if any_changes {
            self.buffers_dirty = true;
            self.emit_stats();
        }
    }

    fn process_ws_message(&mut self, msg: &str) -> bool {
        let Ok(val) = serde_json::from_str::<serde_json::Value>(msg) else {
            log::warn!("Invalid WS JSON");
            return false;
        };

        let msg_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if msg_type != "batch" {
            return false;
        }

        let Some(events) = val.get("events").and_then(|e| e.as_array()) else {
            return false;
        };

        let mut changed = false;
        for event in events {
            let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");
            match event_type {
                "node_added" | "node_updated" => {
                    if let Some(node_val) = event.get("node")
                        && let Ok(node) = serde_json::from_value::<NodeData>(node_val.clone())
                    {
                        self.search.insert(&node.id, &node.name);
                        if !self.node_order.contains(&node.id) {
                            self.node_order.push(node.id.clone());
                        }
                        self.store.add_node(node);
                        changed = true;
                    }
                }
                "node_removed" => {
                    if let Some(id) = event.get("id").and_then(|i| i.as_str()) {
                        self.store.remove_node(id);
                        self.search.remove(id);
                        self.node_order.retain(|n| n != id);
                        self.positions.remove(id);
                        changed = true;
                    }
                }
                "edge_added" => {
                    if let Some(edge_val) = event.get("edge")
                        && let Ok(edge) = serde_json::from_value::<EdgeData>(edge_val.clone())
                    {
                        self.store.add_edge(edge);
                        changed = true;
                    }
                }
                _ => {}
            }
        }

        if changed {
            // Place new nodes near their neighbors
            let new_ids: Vec<String> = self
                .node_order
                .iter()
                .filter(|id| !self.positions.contains_key(id.as_str()))
                .cloned()
                .collect();
            if !new_ids.is_empty() {
                let mut neighbor_map = HashMap::new();
                for id in &new_ids {
                    let ns: Vec<String> = self
                        .store
                        .neighbors(id)
                        .iter()
                        .map(|n| n.id.clone())
                        .collect();
                    neighbor_map.insert(id.clone(), ns);
                }
                let placed = graph_layout::incremental::place_added_nodes(
                    &self.positions,
                    &new_ids,
                    &neighbor_map,
                );
                for (id, x, y) in placed {
                    self.positions.insert(id, (x, y));
                }
            }
        }

        changed
    }

    fn rebuild_buffers(&mut self) {
        let gl = &self.ctx.gl;
        let theme = &self.theme;

        // Determine visible set
        let visible: Vec<usize> = self
            .node_order
            .iter()
            .enumerate()
            .filter(|(_, id)| {
                self.visible_nodes
                    .as_ref()
                    .is_none_or(|v| v.contains(id.as_str()))
            })
            .map(|(i, _)| i)
            .collect();

        let visible_ids: HashSet<&str> = visible
            .iter()
            .map(|&i| self.node_order[i].as_str())
            .collect();

        // --- Node buffer ---
        let mut node_data = Vec::with_capacity(visible.len() * NODE_INSTANCE_FLOATS);
        let mut pick_data = Vec::with_capacity(visible.len() * PICK_INSTANCE_FLOATS);

        for (draw_idx, &orig_idx) in visible.iter().enumerate() {
            let id = &self.node_order[orig_idx];
            let Some(node) = self.store.get_node(id) else {
                continue;
            };
            let &(x, y) = self.positions.get(id).unwrap_or(&(0.0, 0.0));

            // Resolve theme: default <- byType <- byStatus <- interaction
            let node_type_str = format!("{:?}", node.node_type).to_lowercase();
            let status_str = format!("{:?}", node.status).to_lowercase();

            let mut size = theme.nodes.default.size;
            let mut color = theme.nodes.default.color.clone();
            let mut border_color = theme.nodes.default.border_color.clone();
            let mut border_width = theme.nodes.default.border_width;
            let mut shape_name = theme.nodes.default.shape.clone();

            // byType override
            if let Some(ov) = theme.nodes.by_type.get(&node_type_str) {
                if let Some(ref s) = ov.size {
                    size = *s;
                }
                if let Some(ref c) = ov.color {
                    color = c.clone();
                }
                if let Some(ref bc) = ov.border_color {
                    border_color = bc.clone();
                }
                if let Some(ref bw) = ov.border_width {
                    border_width = *bw;
                }
                if let Some(ref sh) = ov.shape {
                    shape_name = sh.clone();
                }
            }

            // byStatus override
            if let Some(so) = theme.nodes.by_status.get(&status_str) {
                if let Some(ref bc) = so.border_color {
                    border_color = bc.clone();
                }
                if let Some(ref bw) = so.border_width {
                    border_width = *bw;
                }
            }

            // Interaction flags
            let mut flags = 0.0f32;
            let is_hovered = self.hovered_id.as_deref() == Some(id.as_str());
            let is_selected = self.selected_id.as_deref() == Some(id.as_str());

            // Spotlight dimming
            let in_spotlight = self.spotlight_ids.is_empty() || self.spotlight_ids.contains(id);

            if is_hovered {
                size *= theme.interaction.hover.scale;
                flags = 1.0;
            }
            if is_selected {
                border_color = theme.interaction.select.border_color.clone();
                border_width = theme.interaction.select.border_width;
                flags = 2.0;
            }

            let (cr, cg, cb, ca) = parse_hex_color(&color);
            let (br2, bg2, bb2, ba2) = parse_hex_color(&border_color);

            // Apply dimming for spotlight or hover-dimming
            let alpha_mult = if !in_spotlight {
                theme.interaction.spotlight.dim_opacity
            } else if self.hovered_id.is_some() && !is_hovered && !is_selected {
                let is_neighbor = self
                    .hovered_id
                    .as_ref()
                    .is_some_and(|hid| self.store.neighbors(hid).iter().any(|n| n.id == *id));
                if theme.interaction.hover.highlight_neighbors && is_neighbor {
                    1.0
                } else {
                    theme.interaction.hover.dim_others
                }
            } else {
                1.0
            };

            // center.xy, radius, color.rgba, border_color.rgba, border_width, shape, flags = 14
            node_data.extend_from_slice(&[
                x,
                y,
                size / 2.0,
                cr,
                cg,
                cb,
                ca * alpha_mult,
                br2,
                bg2,
                bb2,
                ba2 * alpha_mult,
                border_width,
                shape_index(&shape_name),
                flags,
            ]);

            // Pick buffer: center.xy, radius, pick_color.rgb = 6
            let (pr, pg, pb) = PickBuffer::index_to_color(draw_idx);
            pick_data.extend_from_slice(&[x, y, size / 2.0, pr, pg, pb]);
        }

        self.node_renderer.upload(gl, &node_data, visible.len());
        self.pick_buffer.upload(gl, &pick_data, visible.len());

        // --- Edge buffer ---
        let mut edge_data: Vec<f32> = Vec::new();
        let mut edge_count = 0usize;
        for edge in self.store.edges() {
            if !visible_ids.contains(edge.source.as_str())
                || !visible_ids.contains(edge.target.as_str())
            {
                continue;
            }
            let Some(&(sx, sy)) = self.positions.get(&edge.source) else {
                continue;
            };
            let Some(&(tx, ty)) = self.positions.get(&edge.target) else {
                continue;
            };

            let edge_type_str = format!("{:?}", edge.edge_type).to_uppercase();
            let mut ecolor = theme.edges.default.color.clone();
            let mut ewidth = theme.edges.default.width;
            let mut dash = 0.0f32;
            let mut animate = 0.0f32;

            if let Some(ov) = theme.edges.by_type.get(&edge_type_str) {
                if let Some(ref c) = ov.color {
                    ecolor = c.clone();
                }
                if let Some(ref w) = ov.width {
                    ewidth = *w;
                }
                if ov.style.as_deref() == Some("dashed") {
                    dash = 1.0;
                }
                if ov.animate {
                    animate = 1.0;
                }
            }

            let (er, eg, eb, ea) = parse_hex_color(&ecolor);
            // from.xy, to.xy, width, color.rgba, dash, animate = 11
            edge_data.extend_from_slice(&[sx, sy, tx, ty, ewidth, er, eg, eb, ea, dash, animate]);
            edge_count += 1;
        }
        self.edge_renderer.upload(gl, &edge_data, edge_count);

        // --- Hull buffer ---
        if self.show_hulls {
            let mut communities: HashMap<String, u32> = HashMap::new();
            for node in self.store.nodes() {
                if let Some(c) = node.community
                    && visible_ids.contains(node.id.as_str())
                {
                    communities.insert(node.id.clone(), c);
                }
            }
            let hulls = compute_community_hulls(&self.positions, &communities);
            let hull_opacity = theme.communities.hull_opacity;
            let mut hull_verts: Vec<f32> = Vec::new();
            let mut hull_vert_count = 0usize;

            for (community_id, hull_points) in &hulls {
                if hull_points.len() < 3 {
                    continue;
                }
                let palette_idx = (*community_id as usize) % PALETTE.len();
                let (pr, pg, pb) = PALETTE[palette_idx];
                // Fan triangulation from first point
                for i in 1..hull_points.len() - 1 {
                    let p0 = hull_points[0];
                    let p1 = hull_points[i];
                    let p2 = hull_points[i + 1];
                    for &(px, py) in &[p0, p1, p2] {
                        hull_verts.extend_from_slice(&[px, py, pr, pg, pb, hull_opacity]);
                        hull_vert_count += 1;
                    }
                }
            }
            self.hull_renderer.upload(gl, &hull_verts, hull_vert_count);
        } else {
            self.hull_renderer.upload(gl, &[], 0);
        }

        // Text buffer is empty for v0.1.0 (placeholder SDF atlas)
        self.text_renderer.upload(gl, &[], 0);
    }

    fn emit_stats(&self) {
        if let Some(ref cb) = self.on_stats_change {
            let violation_count = self
                .store
                .nodes()
                .filter(|n| n.status == Status::Violation)
                .count();
            let stats = StatsOutput {
                node_count: self.store.node_count(),
                edge_count: self.store.edge_count(),
                violation_count,
                last_updated: chrono::Utc::now().to_rfc3339(),
            };
            if let Ok(val) = to_js_value(&stats) {
                let _ = cb.call1(&JsValue::NULL, &val);
            }
        }
    }
}

// --- Helper types ---

#[derive(serde::Deserialize)]
struct Snapshot {
    nodes: Vec<NodeData>,
    edges: Vec<EdgeData>,
}

#[derive(serde::Deserialize)]
struct FilterInput {
    types: Option<Vec<String>>,
    domains: Option<Vec<String>>,
    #[serde(rename = "status")]
    statuses: Option<Vec<String>>,
}

#[derive(serde::Serialize)]
struct StatsOutput {
    node_count: usize,
    edge_count: usize,
    violation_count: usize,
    last_updated: String,
}

fn parse_node_type(s: &str) -> Option<NodeType> {
    match s {
        "service" => Some(NodeType::Service),
        "database" => Some(NodeType::Database),
        "cache" => Some(NodeType::Cache),
        "external" => Some(NodeType::External),
        "policy" => Some(NodeType::Policy),
        "adr" => Some(NodeType::Adr),
        "incident" => Some(NodeType::Incident),
        _ => None,
    }
}

fn parse_status(s: &str) -> Option<Status> {
    match s {
        "healthy" => Some(Status::Healthy),
        "violation" => Some(Status::Violation),
        "warning" => Some(Status::Warning),
        "enforced" => Some(Status::Enforced),
        _ => None,
    }
}
