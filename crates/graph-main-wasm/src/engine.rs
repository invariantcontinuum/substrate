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

const DEFAULT_THEME_JSON: &str = include_str!("../../graph-wasm/src/default_theme.json");

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

    pub fn update_positions(&mut self, positions: Vec<f32>, flags: Vec<u8>) {
        self.positions = positions;
        self.visual_flags = flags;
        self.buffers_dirty = true;
        self.needs_render = true;
        self.spatial.rebuild(&self.positions, 200);
    }

    pub fn update_edges(&mut self, edge_data: Vec<f32>, edge_count: usize) {
        self.edge_data = edge_data;
        self.edge_count = edge_count;
        self.buffers_dirty = true;
        self.needs_render = true;
    }

    pub fn set_node_ids(&mut self, ids: Vec<String>) {
        self.node_ids = ids;
    }

    // --- Configuration ---

    pub fn set_theme(&mut self, theme_js: &JsValue) -> Result<(), JsValue> {
        let theme: ThemeConfig =
            serde_wasm_bindgen::from_value(theme_js.clone()).map_err(|e| JsValue::from_str(&format!("{e}")))?;
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
        let picked = self.spatial.pick(wx, wy, &self.positions, 20.0);

        self.selected_idx = picked;
        self.buffers_dirty = true;
        self.needs_render = true;

        picked.and_then(|idx| self.node_ids.get(idx).cloned())
    }

    pub fn handle_hover(&mut self, screen_x: f32, screen_y: f32) -> Option<String> {
        let (wx, wy) = self.camera.screen_to_world(screen_x, screen_y);
        let picked = self.spatial.pick(wx, wy, &self.positions, 20.0);

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
    fn rebuild_buffers(&mut self) {
        let gl = &self.ctx.gl;
        let theme = &self.theme;
        let node_count = self.positions.len() / 4;

        // --- Node buffer ---
        let mut node_data = Vec::with_capacity(node_count * NODE_INSTANCE_FLOATS);

        for i in 0..node_count {
            let x = self.positions[i * 4];
            let y = self.positions[i * 4 + 1];
            let _radius = self.positions[i * 4 + 2];
            let type_idx = self.positions[i * 4 + 3] as usize;
            let is_dimmed = self.visual_flags.get(i).copied().unwrap_or(0) == 1;

            let type_name = match type_idx {
                0 => "service",
                1 => "database",
                2 => "cache",
                3 => "external",
                4 => "policy",
                5 => "adr",
                6 => "incident",
                _ => "service",
            };

            let mut size = theme.nodes.default.size;
            let mut color = theme.nodes.default.color.clone();
            let mut border_color = theme.nodes.default.border_color.clone();
            let mut border_width = theme.nodes.default.border_width;
            let mut shape_name = theme.nodes.default.shape.clone();

            if let Some(ov) = theme.nodes.by_type.get(type_name) {
                if let Some(ref s) = ov.size { size = *s; }
                if let Some(ref c) = ov.color { color = c.clone(); }
                if let Some(ref bc) = ov.border_color { border_color = bc.clone(); }
                if let Some(ref bw) = ov.border_width { border_width = *bw; }
                if let Some(ref sh) = ov.shape { shape_name = sh.clone(); }
            }

            let mut flags = 0.0f32;
            let is_hovered = self.hovered_idx == Some(i);
            let is_selected = self.selected_idx == Some(i);

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

            let alpha_mult = if is_dimmed {
                theme.interaction.spotlight.dim_opacity
            } else if self.hovered_idx.is_some() && !is_hovered && !is_selected {
                theme.interaction.hover.dim_others
            } else {
                1.0
            };

            node_data.extend_from_slice(&[
                x, y, size / 2.0,
                cr, cg, cb, ca * alpha_mult,
                br2, bg2, bb2, ba2 * alpha_mult,
                border_width,
                shape_index(&shape_name),
                flags,
            ]);
        }
        self.node_renderer.upload(gl, &node_data, node_count);

        // --- Edge buffer ---
        let mut edge_buf = Vec::with_capacity(self.edge_count * EDGE_INSTANCE_FLOATS);
        let edge_stride = 6;
        for i in 0..self.edge_count {
            let base = i * edge_stride;
            if base + 5 >= self.edge_data.len() { break; }
            let sx = self.edge_data[base];
            let sy = self.edge_data[base + 1];
            let tx = self.edge_data[base + 2];
            let ty = self.edge_data[base + 3];
            let type_idx = self.edge_data[base + 4] as usize;
            let _weight = self.edge_data[base + 5];

            let type_name = match type_idx {
                0 => "DEPENDSON",
                1 => "CALLS",
                2 => "VIOLATION",
                3 => "ENFORCES",
                4 => "DRIFT",
                _ => "DEPENDSON",
            };

            let mut ecolor = theme.edges.default.color.clone();
            let mut ewidth = theme.edges.default.width;
            let mut dash = 0.0f32;
            let mut animate = 0.0f32;

            if let Some(ov) = theme.edges.by_type.get(type_name) {
                if let Some(ref c) = ov.color { ecolor = c.clone(); }
                if let Some(ref w) = ov.width { ewidth = *w; }
                if ov.style.as_deref() == Some("dashed") { dash = 1.0; }
                if ov.animate { animate = 1.0; }
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
