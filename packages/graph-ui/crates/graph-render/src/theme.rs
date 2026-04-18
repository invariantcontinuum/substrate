use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeConfig {
    #[serde(default = "default_background")]
    pub background: String,
    pub nodes: NodeTheme,
    pub edges: EdgeTheme,
    #[serde(default)]
    pub communities: CommunityTheme,
    #[serde(default)]
    pub interaction: InteractionTheme,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeTheme {
    pub default: NodeStyle,
    #[serde(rename = "byType", default)]
    pub by_type: HashMap<String, NodeStyleOverride>,
    #[serde(rename = "byStatus", default)]
    pub by_status: HashMap<String, NodeStatusOverride>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeStyle {
    #[serde(default = "default_shape")]
    pub shape: String,
    #[serde(default = "default_node_size")]
    pub size: f32,
    #[serde(rename = "halfWidth", default)]
    pub half_width: Option<f32>,
    #[serde(rename = "halfHeight", default)]
    pub half_height: Option<f32>,
    #[serde(rename = "cornerRadius", default)]
    pub corner_radius: Option<f32>,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(rename = "borderWidth", default = "default_border_width")]
    pub border_width: f32,
    #[serde(rename = "borderColor", default = "default_border_color")]
    pub border_color: String,
    #[serde(default)]
    pub label: Option<LabelStyle>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelStyle {
    pub field: String,
    #[serde(default = "default_label_color")]
    pub color: String,
    #[serde(default = "default_label_size")]
    pub size: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NodeStyleOverride {
    pub shape: Option<String>,
    pub size: Option<f32>,
    #[serde(rename = "halfWidth")]
    pub half_width: Option<f32>,
    #[serde(rename = "halfHeight")]
    pub half_height: Option<f32>,
    #[serde(rename = "cornerRadius")]
    pub corner_radius: Option<f32>,
    pub color: Option<String>,
    #[serde(rename = "borderWidth")]
    pub border_width: Option<f32>,
    #[serde(rename = "borderColor")]
    pub border_color: Option<String>,
    #[serde(rename = "borderStyle")]
    pub border_style: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NodeStatusOverride {
    #[serde(rename = "borderColor")]
    pub border_color: Option<String>,
    #[serde(rename = "borderWidth")]
    pub border_width: Option<f32>,
    #[serde(default)]
    pub pulse: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeTheme {
    pub default: EdgeStyle,
    #[serde(rename = "byType", default)]
    pub by_type: HashMap<String, EdgeStyleOverride>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeStyle {
    #[serde(default = "default_edge_color")]
    pub color: String,
    #[serde(default = "default_edge_width")]
    pub width: f32,
    #[serde(default = "default_arrow")]
    pub arrow: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EdgeStyleOverride {
    pub color: Option<String>,
    pub width: Option<f32>,
    pub style: Option<String>,
    #[serde(default)]
    pub animate: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityTheme {
    #[serde(default)]
    pub hull: bool,
    #[serde(rename = "hullOpacity", default = "default_hull_opacity")]
    pub hull_opacity: f32,
    #[serde(default = "default_palette")]
    pub palette: String,
}

impl Default for CommunityTheme {
    fn default() -> Self {
        Self {
            hull: false,
            hull_opacity: default_hull_opacity(),
            palette: default_palette(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InteractionTheme {
    #[serde(default)]
    pub hover: HoverStyle,
    #[serde(default)]
    pub select: SelectStyle,
    #[serde(default)]
    pub spotlight: SpotlightStyle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HoverStyle {
    #[serde(default = "default_hover_scale")]
    pub scale: f32,
    #[serde(rename = "highlightNeighbors", default)]
    pub highlight_neighbors: bool,
    #[serde(rename = "dimOthers", default = "default_dim")]
    pub dim_others: f32,
}

impl Default for HoverStyle {
    fn default() -> Self {
        Self {
            scale: 1.3,
            highlight_neighbors: true,
            dim_others: 0.15,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectStyle {
    #[serde(rename = "borderColor", default = "default_select_border")]
    pub border_color: String,
    #[serde(rename = "borderWidth", default = "default_select_width")]
    pub border_width: f32,
    #[serde(rename = "expandLabel", default)]
    pub expand_label: bool,
}

impl Default for SelectStyle {
    fn default() -> Self {
        Self {
            border_color: "#ffffff".into(),
            border_width: 3.0,
            expand_label: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotlightStyle {
    #[serde(rename = "dimOpacity", default = "default_spotlight_dim")]
    pub dim_opacity: f32,
    #[serde(rename = "transitionMs", default = "default_transition")]
    pub transition_ms: u32,
}

impl Default for SpotlightStyle {
    fn default() -> Self {
        Self {
            dim_opacity: 0.05,
            transition_ms: 300,
        }
    }
}

/// Parse a CSS-style color string into `(r, g, b, a)` floats in [0, 1].
/// Accepts `#RRGGBB`, `#RRGGBBAA`, `rgb(r, g, b)`, and `rgba(r, g, b, a)`.
/// Returns `(0.5, 0.5, 0.5, 1.0)` on parse failure as a safe fallback.
pub fn parse_css_color(s: &str) -> (f32, f32, f32, f32) {
    let trimmed = s.trim();
    if trimmed.starts_with('#') {
        return parse_hex_internal(trimmed);
    }
    if trimmed.starts_with("rgba(") && trimmed.ends_with(')') {
        return parse_rgba(&trimmed[5..trimmed.len() - 1]);
    }
    if trimmed.starts_with("rgb(") && trimmed.ends_with(')') {
        let (r, g, b, _) = parse_rgba(&trimmed[4..trimmed.len() - 1]);
        return (r, g, b, 1.0);
    }
    (0.5, 0.5, 0.5, 1.0)
}

fn parse_hex_internal(hex: &str) -> (f32, f32, f32, f32) {
    let h = hex.trim_start_matches('#');
    if h.len() != 6 && h.len() != 8 {
        return (0.5, 0.5, 0.5, 1.0);
    }
    let r = u8::from_str_radix(&h[0..2], 16);
    let g = u8::from_str_radix(&h[2..4], 16);
    let b = u8::from_str_radix(&h[4..6], 16);
    let a = if h.len() == 8 {
        u8::from_str_radix(&h[6..8], 16)
            .map(|v| v as f32 / 255.0)
            .unwrap_or(1.0)
    } else {
        1.0
    };
    match (r, g, b) {
        (Ok(r), Ok(g), Ok(b)) => (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0, a),
        _ => (0.5, 0.5, 0.5, 1.0),
    }
}

fn parse_rgba(inside: &str) -> (f32, f32, f32, f32) {
    let parts: Vec<&str> = inside.split(',').map(|p| p.trim()).collect();
    if parts.len() < 3 || parts.len() > 4 {
        return (0.5, 0.5, 0.5, 1.0);
    }
    let r: Result<u32, _> = parts[0].parse();
    let g: Result<u32, _> = parts[1].parse();
    let b: Result<u32, _> = parts[2].parse();
    let a_val: f32 = if parts.len() == 4 {
        match parts[3].parse::<f32>() {
            Ok(v) if (0.0..=1.0).contains(&v) => v,
            _ => return (0.5, 0.5, 0.5, 1.0),
        }
    } else {
        1.0
    };
    match (r, g, b) {
        (Ok(r), Ok(g), Ok(b)) if r <= 255 && g <= 255 && b <= 255 => {
            (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0, a_val)
        }
        _ => (0.5, 0.5, 0.5, 1.0),
    }
}

/// Parse a hex color string (e.g. "#ff0000" or "#ff000080") into (r, g, b, a) floats in [0, 1].
/// Kept for backward compatibility — now delegates to `parse_css_color` which also accepts
/// `rgb(...)` and `rgba(...)` strings.
pub fn parse_hex_color(hex: &str) -> (f32, f32, f32, f32) {
    parse_css_color(hex)
}

/// Map a shape name to its shader index.
pub fn shape_index(shape: &str) -> f32 {
    match shape {
        "circle" => 0.0,
        "diamond" => 1.0,
        "square" => 2.0,
        "hexagon" => 3.0,
        "triangle" => 4.0,
        "octagon" => 5.0,
        "roundrectangle" => 6.0,
        "barrel" => 7.0,
        _ => 0.0,
    }
}

fn default_background() -> String {
    "#0d1117".into()
}
fn default_shape() -> String {
    "circle".into()
}
fn default_node_size() -> f32 {
    12.0
}
fn default_color() -> String {
    "#8b949e".into()
}
fn default_border_width() -> f32 {
    1.5
}
fn default_border_color() -> String {
    "#30363d".into()
}
fn default_label_color() -> String {
    "#c9d1d9".into()
}
fn default_label_size() -> f32 {
    11.0
}
fn default_edge_color() -> String {
    "#21262d".into()
}
fn default_edge_width() -> f32 {
    1.0
}
fn default_arrow() -> String {
    "target".into()
}
fn default_hull_opacity() -> f32 {
    0.06
}
fn default_palette() -> String {
    "categorical-12".into()
}
fn default_hover_scale() -> f32 {
    1.3
}
fn default_dim() -> f32 {
    0.15
}
fn default_select_border() -> String {
    "#ffffff".into()
}
fn default_select_width() -> f32 {
    3.0
}
fn default_spotlight_dim() -> f32 {
    0.05
}
fn default_transition() -> u32 {
    300
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_theme_json() {
        let json = r##"{"background":"#0d1117","nodes":{"default":{"shape":"circle","size":12,"color":"#8b949e"},"byType":{"service":{"color":"#58a6ff","size":16}},"byStatus":{"violation":{"borderColor":"#f85149","pulse":true}}},"edges":{"default":{"color":"#21262d","width":1},"byType":{"DEPENDS_ON":{"color":"#58a6ff"}}}}"##;
        let theme: ThemeConfig = serde_json::from_str(json).unwrap();
        assert_eq!(
            theme.nodes.by_type["service"].color.as_deref(),
            Some("#58a6ff")
        );
        assert!(theme.nodes.by_status["violation"].pulse);
    }

    #[test]
    fn hex_color_parsing() {
        let (r, g, b, a) = parse_hex_color("#ff0000");
        assert!((r - 1.0).abs() < 0.01);
        assert!(g < 0.01);
        assert!(b < 0.01);
        assert!((a - 1.0).abs() < 0.01);
    }

    #[test]
    fn parse_theme_with_nonuniform_sizing() {
        let json = r##"{"background":"#0d0d12","nodes":{"default":{"shape":"roundrectangle","halfWidth":55,"halfHeight":19,"cornerRadius":0.25,"color":"#0f0f1f","borderColor":"#3b4199"},"byType":{"database":{"shape":"barrel","halfWidth":55,"halfHeight":19,"color":"#0a1a14"}},"byStatus":{}},"edges":{"default":{"color":"#21262d","width":1},"byType":{}}}"##;
        let theme: ThemeConfig = serde_json::from_str(json).unwrap();
        assert_eq!(theme.nodes.default.shape, "roundrectangle");
        assert_eq!(theme.nodes.default.half_width, Some(55.0));
        assert_eq!(theme.nodes.default.half_height, Some(19.0));
        assert_eq!(theme.nodes.default.corner_radius, Some(0.25));
        let db = &theme.nodes.by_type["database"];
        assert_eq!(db.shape.as_deref(), Some("barrel"));
        assert_eq!(db.half_width, Some(55.0));
    }

    #[test]
    fn legacy_size_still_works() {
        let json = r##"{"background":"#000","nodes":{"default":{"shape":"circle","size":12,"color":"#888","borderWidth":1,"borderColor":"#333"},"byType":{},"byStatus":{}},"edges":{"default":{"color":"#333","width":1},"byType":{}}}"##;
        let theme: ThemeConfig = serde_json::from_str(json).unwrap();
        assert_eq!(theme.nodes.default.size, 12.0);
        assert_eq!(theme.nodes.default.half_width, None);
        assert_eq!(theme.nodes.default.half_height, None);
    }

    #[test]
    fn shape_index_covers_new_shapes() {
        assert_eq!(shape_index("circle"), 0.0);
        assert_eq!(shape_index("diamond"), 1.0);
        assert_eq!(shape_index("square"), 2.0);
        assert_eq!(shape_index("hexagon"), 3.0);
        assert_eq!(shape_index("triangle"), 4.0);
        assert_eq!(shape_index("octagon"), 5.0);
        assert_eq!(shape_index("roundrectangle"), 6.0);
        assert_eq!(shape_index("barrel"), 7.0);
        assert_eq!(shape_index("unknown"), 0.0);
    }

    #[test]
    fn default_theme_json_parses() {
        let json = include_str!("../../graph-main-wasm/src/default_theme.json");
        let theme: ThemeConfig = serde_json::from_str(json).expect("default_theme.json must parse");
        assert_eq!(theme.nodes.default.shape, "roundrectangle");
        assert_eq!(theme.nodes.default.half_width, Some(55.0));
        assert_eq!(theme.nodes.default.half_height, Some(19.0));
        assert_eq!(
            theme.nodes.by_type["database"].shape.as_deref(),
            Some("barrel")
        );
        assert_eq!(
            theme.nodes.by_type["policy"].shape.as_deref(),
            Some("diamond")
        );
        assert!(theme.nodes.by_status["violation"].pulse);
        assert!(theme.edges.by_type.contains_key("violation"));
        assert!(theme.edges.by_type.contains_key("enforces"));
        assert_eq!(
            theme.edges.by_type["enforces"].style.as_deref(),
            Some("dotted")
        );
    }

    #[test]
    fn css_color_hex_6() {
        let (r, g, b, a) = parse_css_color("#ff0000");
        assert!((r - 1.0).abs() < 0.01);
        assert!(g < 0.01);
        assert!(b < 0.01);
        assert!((a - 1.0).abs() < 0.01);
    }

    #[test]
    fn css_color_hex_8() {
        let (r, g, b, a) = parse_css_color("#00ff0080");
        assert!(r < 0.01);
        assert!((g - 1.0).abs() < 0.01);
        assert!(b < 0.01);
        assert!((a - 128.0 / 255.0).abs() < 0.01);
    }

    #[test]
    fn css_color_rgb() {
        let (r, g, b, a) = parse_css_color("rgb(255, 0, 0)");
        assert!((r - 1.0).abs() < 0.01);
        assert!(g < 0.01);
        assert!(b < 0.01);
        assert!((a - 1.0).abs() < 0.01);
    }

    #[test]
    fn css_color_rgba() {
        let (r, g, b, a) = parse_css_color("rgba(99, 102, 241, 0.3)");
        assert!((r - 99.0 / 255.0).abs() < 0.01);
        assert!((g - 102.0 / 255.0).abs() < 0.01);
        assert!((b - 241.0 / 255.0).abs() < 0.01);
        assert!((a - 0.3).abs() < 0.01);
    }

    #[test]
    fn css_color_rgba_flexible_whitespace() {
        let (r, _g, _b, a) = parse_css_color("rgba(255,255,255,0.12)");
        assert!((r - 1.0).abs() < 0.01);
        assert!((a - 0.12).abs() < 0.01);
    }

    #[test]
    fn css_color_invalid_fallback() {
        let (r, g, b, a) = parse_css_color("not-a-color");
        assert!((r - 0.5).abs() < 0.01);
        assert!((g - 0.5).abs() < 0.01);
        assert!((b - 0.5).abs() < 0.01);
        assert!((a - 1.0).abs() < 0.01);
    }

    #[test]
    fn parse_hex_color_still_works() {
        // Backward compat: existing call sites passing hex strings must still work.
        let (r, g, b, _a) = parse_hex_color("#3b4199");
        assert!((r - 0x3b as f32 / 255.0).abs() < 0.01);
        assert!((g - 0x41 as f32 / 255.0).abs() < 0.01);
        assert!((b - 0x99 as f32 / 255.0).abs() < 0.01);
    }
}
