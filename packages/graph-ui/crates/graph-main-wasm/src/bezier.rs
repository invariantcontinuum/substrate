//! Quadratic bezier tessellation. Every logical edge becomes N short line
//! segments with cumulative arc length stamped on each segment — the
//! existing edge renderer accepts them unchanged and (future) dash shader
//! will read the arc length to keep patterns continuous across segments.

pub const DEFAULT_SEGMENTS: usize = 8;
pub const DEFAULT_BEND_RATIO: f32 = 0.08;

#[derive(Debug, Clone, Copy)]
pub struct Segment {
    pub from: (f32, f32),
    pub to: (f32, f32),
    pub arc_start: f32,
}

/// Tessellate a quadratic bezier from `p0` to `p1`, control point offset
/// perpendicular to the chord by `chord_length * bend_ratio`. Returns exactly
/// `segments.clamp(2, 16)` segments; first `from == p0`, last `to == p1`.
pub fn tessellate_quadratic(
    p0: (f32, f32),
    p1: (f32, f32),
    bend_ratio: f32,
    segments: usize,
) -> Vec<Segment> {
    let n = segments.clamp(2, 16);
    let dx = p1.0 - p0.0;
    let dy = p1.1 - p0.1;
    let chord_len = (dx * dx + dy * dy).sqrt().max(1e-5);
    let nx = -dy / chord_len;
    let ny =  dx / chord_len;
    let off = chord_len * bend_ratio;
    let cx = (p0.0 + p1.0) * 0.5 + nx * off;
    let cy = (p0.1 + p1.1) * 0.5 + ny * off;

    let mut out = Vec::with_capacity(n);
    let mut prev = p0;
    let mut arc = 0.0f32;
    for i in 1..=n {
        let t = i as f32 / n as f32;
        let one_minus = 1.0 - t;
        let bx = p0.0 * one_minus * one_minus + cx * 2.0 * one_minus * t + p1.0 * t * t;
        let by = p0.1 * one_minus * one_minus + cy * 2.0 * one_minus * t + p1.1 * t * t;
        let seg = Segment { from: prev, to: (bx, by), arc_start: arc };
        let sx = bx - prev.0;
        let sy = by - prev.1;
        arc += (sx * sx + sy * sy).sqrt();
        out.push(seg);
        prev = (bx, by);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    const EPS: f32 = 1e-4;

    #[test]
    fn tessellate_endpoints_match_input() {
        let segs = tessellate_quadratic((0.0, 0.0), (100.0, 0.0), 0.08, 8);
        assert_eq!(segs.len(), 8);
        assert!((segs[0].from.0 - 0.0).abs() < EPS);
        assert!((segs[0].from.1 - 0.0).abs() < EPS);
        assert!((segs[7].to.0 - 100.0).abs() < EPS);
    }

    #[test]
    fn segment_count_clamped() {
        assert_eq!(tessellate_quadratic((0.,0.), (1.,0.), 0., 1).len(), 2);
        assert_eq!(tessellate_quadratic((0.,0.), (1.,0.), 0., 99).len(), 16);
    }

    #[test]
    fn arc_start_is_monotonic() {
        let segs = tessellate_quadratic((0.0, 0.0), (100.0, 20.0), 0.08, 8);
        for i in 1..segs.len() {
            assert!(segs[i].arc_start >= segs[i - 1].arc_start);
        }
    }

    #[test]
    fn zero_bend_is_straight_chord() {
        let segs = tessellate_quadratic((0.0, 0.0), (80.0, 0.0), 0.0, 8);
        for s in &segs {
            assert!(s.from.1.abs() < EPS);
            assert!(s.to.1.abs() < EPS);
        }
    }
}
