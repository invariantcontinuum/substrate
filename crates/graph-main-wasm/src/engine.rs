use wasm_bindgen::prelude::*;
use web_sys::HtmlCanvasElement;

use graph_render::camera::Camera;
use graph_render::context::RenderContext;
use graph_render::edges::{EDGE_INSTANCE_FLOATS, EdgeRenderer};
use graph_render::hulls::HullRenderer;
use graph_render::nodes::{NODE_INSTANCE_FLOATS, NodeRenderer};
use graph_render::text::TextRenderer;
use graph_render::theme::{ThemeConfig, parse_hex_color, shape_index};

use crate::spatial::SpatialGrid;

const DEFAULT_THEME_JSON: &str = include_str!("default_theme.json");

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
    text_renderer: TextRenderer,
    hull_renderer: HullRenderer,

    // Current data from worker
    positions: Vec<f32>,
    visual_flags: Vec<u8>,
    edge_data: Vec<f32>,
    edge_count: usize,
    node_ids: Vec<String>,
    node_metadata: std::collections::HashMap<String, NodeMeta>,

    // Spatial index
    spatial: SpatialGrid,

    // Interaction state
    hovered_idx: Option<usize>,
    selected_idx: Option<usize>,
    show_hulls: bool,

    // Panning state
    is_panning: bool,
    last_mouse_x: f32,
    last_mouse_y: f32,

    // Animation
    start_time: f64,
    buffers_dirty: bool,
    needs_render: bool,

    // Frame budget tracking
    budget_overruns: u32,
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
        let text_renderer = TextRenderer::new(&ctx).map_err(|e| JsValue::from_str(&e))?;
        let hull_renderer = HullRenderer::new(&ctx).map_err(|e| JsValue::from_str(&e))?;

        Ok(Self {
            ctx,
            camera,
            theme,
            node_renderer,
            edge_renderer,
            text_renderer,
            hull_renderer,
            positions: Vec::new(),
            visual_flags: Vec::new(),
            edge_data: Vec::new(),
            edge_count: 0,
            node_ids: Vec::new(),
            node_metadata: std::collections::HashMap::new(),
            spatial: SpatialGrid::new(),
            hovered_idx: None,
            selected_idx: None,
            show_hulls: false,
            is_panning: false,
            last_mouse_x: 0.0,
            last_mouse_y: 0.0,
            start_time: 0.0,
            buffers_dirty: true,
            needs_render: true,
            budget_overruns: 0,
        })
    }

    // --- Data updates from worker ---

    pub fn update_positions(&mut self, positions: &[f32], flags: &[u8]) {
        self.positions = positions.to_vec();
        self.visual_flags = flags.to_vec();
        self.buffers_dirty = true;
        self.needs_render = true;
        self.spatial.rebuild(&self.positions, 200);
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

    pub fn set_node_metadata(&mut self, ids_js: JsValue, types_js: JsValue, statuses_js: JsValue) -> Result<(), JsValue> {
        let ids: Vec<String> = serde_wasm_bindgen::from_value(ids_js)
            .map_err(|e| JsValue::from_str(&format!("ids: {e}")))?;
        let types: Vec<String> = serde_wasm_bindgen::from_value(types_js)
            .map_err(|e| JsValue::from_str(&format!("types: {e}")))?;
        let statuses: Vec<String> = serde_wasm_bindgen::from_value(statuses_js)
            .map_err(|e| JsValue::from_str(&format!("statuses: {e}")))?;
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
        self.buffers_dirty = true;
        Ok(())
    }

    // --- Configuration ---

    pub fn set_theme(&mut self, theme_js: &JsValue) -> Result<(), JsValue> {
        let theme: ThemeConfig = serde_wasm_bindgen::from_value(theme_js.clone())
            .map_err(|e| JsValue::from_str(&format!("{e}")))?;
        self.theme = theme;
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

        self.selected_idx = picked;
        self.buffers_dirty = true;
        self.needs_render = true;

        picked.and_then(|idx| self.node_ids.get(idx).cloned())
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
            self.camera.pan(dx, dy);
            self.last_mouse_x = x;
            self.last_mouse_y = y;
            self.needs_render = true;
        }
    }

    pub fn handle_pan_end(&mut self) {
        self.is_panning = false;
    }

    pub fn handle_zoom(&mut self, delta: f32, x: f32, y: f32) {
        let factor = if delta > 0.0 { 0.9 } else { 1.1 };
        self.camera.zoom_at(factor, x, y);
        self.needs_render = true;
    }

    // --- Main render frame ---

    pub fn frame(&mut self, timestamp: f64) -> bool {
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

        let vp = self.camera.view_projection_matrix();
        self.hull_renderer.draw(&self.ctx.gl, &vp);
        self.edge_renderer.draw(&self.ctx.gl, &vp, time);
        self.node_renderer.draw(&self.ctx.gl, &vp, time);
        self.text_renderer.draw(&self.ctx.gl, &vp);

        self.needs_render = false;
        true
    }

    pub fn needs_frame(&self) -> bool {
        self.needs_render
    }

    pub fn request_render(&mut self) {
        self.needs_render = true;
    }
}

// --- Private ---

impl RenderEngine {
    /// Resolve effective per-node style from theme: default + type override + status override.
    /// Returns a struct with named fields instead of a positional tuple.
    fn resolved_node_style(
        &self,
        node_type: &str,
        status: &str,
    ) -> ResolvedNodeStyle {
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

    /// Coarse-then-fine node picking: uses the spatial grid for a candidate list,
    /// then performs a per-node AABB check using the theme-resolved half_w / half_h.
    fn hit_test_node(&self, world_x: f32, world_y: f32) -> Option<usize> {
        // Conservative bounding radius: worst-case half-dimension of any resolved style.
        // Cheap since node_metadata is small. Fallback to a safe 20.0 when empty.
        let max_bound = self
            .node_ids
            .iter()
            .filter_map(|id| self.node_metadata.get(id))
            .map(|meta| {
                let style = self.resolved_node_style(&meta.node_type, &meta.status);
                style.half_w.max(style.half_h)
            })
            .fold(0.0_f32, f32::max)
            .max(20.0);

        let candidates = self.spatial.candidates_within(world_x, world_y, max_bound);
        for idx in candidates {
            if idx * 4 + 1 >= self.positions.len() {
                continue;
            }
            let cx = self.positions[idx * 4];
            let cy = self.positions[idx * 4 + 1];
            // Look up this node's AABB via metadata + theme.
            let (hw, hh) = match self.node_ids.get(idx) {
                Some(id) => self
                    .node_metadata
                    .get(id)
                    .map(|m| {
                        let style = self.resolved_node_style(&m.node_type, &m.status);
                        (style.half_w, style.half_h)
                    })
                    .unwrap_or((20.0, 20.0)),
                None => (20.0, 20.0),
            };
            if (world_x - cx).abs() <= hw && (world_y - cy).abs() <= hh {
                return Some(idx);
            }
        }
        None
    }

    fn rebuild_buffers(&mut self) {
        let gl = &self.ctx.gl;
        let node_count = self.positions.len() / 4;

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
            let mut border_width = style.border_width;

            let is_hovered = self.hovered_idx == Some(i);
            let is_selected = self.selected_idx == Some(i);

            // Hovered: bit 1 of flags (additive with pulse bit 0)
            if is_hovered {
                flags |= 2; // bit 1 = hovered
            }
            // Selected: override border, set bit 2
            if is_selected {
                let sel_border = self.theme.interaction.select.border_color.clone();
                let (br, bg, bb, ba) = parse_hex_color(&sel_border);
                border_color = [br, bg, bb, ba];
                border_width = self.theme.interaction.select.border_width;
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
                style.half_w,
                style.half_h,
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
        let mut edge_buf = Vec::with_capacity(self.edge_count * EDGE_INSTANCE_FLOATS);
        let edge_stride = 6;
        for i in 0..self.edge_count {
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

            if let Some(ov) = self.theme.edges.by_type.get(type_name) {
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
            edge_buf.extend_from_slice(&[sx, sy, tx, ty, ewidth, er, eg, eb, ea, dash, animate]);
        }
        self.edge_renderer.upload(gl, &edge_buf, self.edge_count);

        // --- Hull buffer ---
        self.hull_renderer.upload(gl, &[], 0);

        // --- Text buffer ---
        self.text_renderer.upload(gl, &[], 0);
    }
}
