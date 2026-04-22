//! Animated camera tween over `transition_ms`, ease-out cubic.
//! Used by focus_fit to produce the legacy's 400 ms spotlight pan.

#[derive(Debug, Clone, Copy)]
pub struct CameraAnim {
    pub from_center: (f32, f32),
    pub to_center: (f32, f32),
    pub from_zoom: f32,
    pub to_zoom: f32,
    pub start_ms: f64,
    pub duration_ms: f64,
}

impl CameraAnim {
    pub fn new(
        from: ((f32, f32), f32),
        to: ((f32, f32), f32),
        start_ms: f64,
        duration_ms: f64,
    ) -> Self {
        Self {
            from_center: from.0,
            from_zoom: from.1,
            to_center: to.0,
            to_zoom: to.1,
            start_ms,
            duration_ms: duration_ms.max(1.0),
        }
    }

    /// Sample the camera at `now_ms`. Returns `(center, zoom, done)`.
    pub fn sample(&self, now_ms: f64) -> ((f32, f32), f32, bool) {
        let raw = ((now_ms - self.start_ms) / self.duration_ms) as f32;
        let t = raw.clamp(0.0, 1.0);
        let eased = ease_out_cubic(t);
        let cx = lerp(self.from_center.0, self.to_center.0, eased);
        let cy = lerp(self.from_center.1, self.to_center.1, eased);
        let z  = lerp(self.from_zoom,     self.to_zoom,     eased);
        ((cx, cy), z, raw >= 1.0)
    }
}

fn lerp(a: f32, b: f32, t: f32) -> f32 { a + (b - a) * t }
fn ease_out_cubic(t: f32) -> f32 { let u = 1.0 - t; 1.0 - u * u * u }

#[cfg(test)]
mod tests {
    use super::*;
    const EPS: f32 = 1e-4;

    #[test]
    fn sample_t0_is_from() {
        let a = CameraAnim::new(((0.0, 0.0), 1.0), ((100.0, 50.0), 2.0), 1000.0, 400.0);
        let ((cx, cy), z, done) = a.sample(1000.0);
        assert!((cx - 0.0).abs() < EPS);
        assert!((cy - 0.0).abs() < EPS);
        assert!((z  - 1.0).abs() < EPS);
        assert!(!done);
    }

    #[test]
    fn sample_t1_is_to_and_done() {
        let a = CameraAnim::new(((0.0, 0.0), 1.0), ((100.0, 50.0), 2.0), 0.0, 400.0);
        let ((cx, cy), z, done) = a.sample(400.0);
        assert!((cx - 100.0).abs() < EPS);
        assert!((cy - 50.0).abs()  < EPS);
        assert!((z  - 2.0).abs()   < EPS);
        assert!(done);
    }

    #[test]
    fn ease_out_cubic_midpoint_is_past_half() {
        let ((cx, _), _, _) = CameraAnim::new(((0.0, 0.0), 1.0), ((100.0, 0.0), 1.0), 0.0, 400.0).sample(200.0);
        // ease-out at t=0.5 is 1 - (0.5)^3 = 0.875
        assert!((cx - 87.5).abs() < 0.5);
    }
}
