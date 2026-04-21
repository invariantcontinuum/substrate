pub struct Camera {
    pub x: f32,
    pub y: f32,
    pub zoom: f32,
    pub min_zoom: f32,
    pub max_zoom: f32,
    viewport_width: f32,
    viewport_height: f32,
    world_aabb: Option<(f32, f32, f32, f32)>,
}

impl Camera {
    pub fn new(viewport_width: f32, viewport_height: f32) -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            zoom: 1.0,
            min_zoom: 0.05,
            max_zoom: 8.0,
            viewport_width,
            viewport_height,
            world_aabb: None,
        }
    }

    pub fn set_viewport(&mut self, width: f32, height: f32) {
        self.viewport_width = width;
        self.viewport_height = height;
    }

    pub fn viewport_width(&self) -> f32 {
        self.viewport_width
    }

    pub fn viewport_height(&self) -> f32 {
        self.viewport_height
    }

    pub fn pan(&mut self, dx: f32, dy: f32) {
        self.x += dx / self.zoom;
        self.y += dy / self.zoom;
    }

    pub fn zoom_at(&mut self, factor: f32, screen_x: f32, screen_y: f32) {
        let old_zoom = self.zoom;
        self.zoom = (self.zoom * factor).clamp(self.min_zoom, self.max_zoom);
        let actual_factor = self.zoom / old_zoom;
        let world_x = (screen_x - self.viewport_width / 2.0) / old_zoom - self.x;
        let world_y = (screen_y - self.viewport_height / 2.0) / old_zoom - self.y;
        self.x -= world_x * (1.0 - 1.0 / actual_factor);
        self.y -= world_y * (1.0 - 1.0 / actual_factor);
    }

    pub fn view_projection_matrix(&self) -> [f32; 16] {
        let hw = self.viewport_width / (2.0 * self.zoom);
        let hh = self.viewport_height / (2.0 * self.zoom);
        let (left, right) = (-self.x - hw, -self.x + hw);
        let (bottom, top) = (-self.y - hh, -self.y + hh);
        let (sx, sy) = (2.0 / (right - left), 2.0 / (top - bottom));
        let (tx, ty) = (
            -(right + left) / (right - left),
            -(top + bottom) / (top - bottom),
        );
        [
            sx, 0.0, 0.0, 0.0, 0.0, sy, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, tx, ty, 0.0, 1.0,
        ]
    }

    pub fn visible_bounds(&self) -> (f32, f32, f32, f32) {
        let hw = self.viewport_width / (2.0 * self.zoom);
        let hh = self.viewport_height / (2.0 * self.zoom);
        (-self.x - hw, -self.y - hh, -self.x + hw, -self.y + hh)
    }

    pub fn screen_to_world(&self, screen_x: f32, screen_y: f32) -> (f32, f32) {
        (
            (screen_x - self.viewport_width / 2.0) / self.zoom - self.x,
            (screen_y - self.viewport_height / 2.0) / self.zoom - self.y,
        )
    }

    /// Record the current world AABB of the content — used by `pan_clamped`
    /// to ensure ≥ 25% of the content stays in the viewport.
    pub fn set_world_bounds(&mut self, x0: f32, y0: f32, x1: f32, y1: f32) {
        debug_assert!(x0 <= x1 && y0 <= y1, "inverted AABB passed to set_world_bounds");
        self.world_aabb = Some((x0, y0, x1, y1));
    }

    /// Center on the AABB mid and set zoom so the AABB (+padding_px in screen space)
    /// fits inside the viewport. Also records the AABB for pan clamping.
    pub fn fit_to_bounds(&mut self, x0: f32, y0: f32, x1: f32, y1: f32, padding_px: f32) {
        let graph_w = (x1 - x0).max(f32::EPSILON);
        let graph_h = (y1 - y0).max(f32::EPSILON);
        let scale_x = (self.viewport_width - 2.0 * padding_px).max(1.0) / graph_w;
        let scale_y = (self.viewport_height - 2.0 * padding_px).max(1.0) / graph_h;
        let z = scale_x.min(scale_y).clamp(self.min_zoom, self.max_zoom);

        self.x = (x0 + x1) * 0.5;
        self.y = (y0 + y1) * 0.5;
        self.zoom = z;
        self.world_aabb = Some((x0, y0, x1, y1));
    }

    /// Pan with clamp: at least 25% of `world_aabb` (if set) must intersect the viewport.
    /// If the requested pan would violate the invariant, the move is rejected — the
    /// camera stays at its pre-pan position. This avoids the UX jank of snapping to
    /// the AABB centroid mid-drag.
    pub fn pan_clamped(&mut self, dx: f32, dy: f32) {
        let saved_x = self.x;
        let saved_y = self.y;
        self.pan(dx, dy);
        if let Some((x0, y0, x1, y1)) = self.world_aabb {
            debug_assert!(x0 <= x1 && y0 <= y1, "inverted world_aabb");
            let (vxa, vya, vxb, vyb) = self.visible_bounds();
            let ix_a = x0.max(vxa);
            let ix_b = x1.min(vxb);
            let iy_a = y0.max(vya);
            let iy_b = y1.min(vyb);
            let inter_w = (ix_b - ix_a).max(0.0);
            let inter_h = (iy_b - iy_a).max(0.0);
            let inter_area = inter_w * inter_h;
            let aabb_area = ((x1 - x0) * (y1 - y0)).max(f32::EPSILON);
            if inter_area / aabb_area < 0.25 {
                // Reject the pan — restore the pre-pan position rather than snapping
                // to centroid. The camera effectively "sticks" at the edge of what's
                // allowed instead of teleporting, which is much less jarring in a drag.
                self.x = saved_x;
                self.y = saved_y;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_camera_centered() {
        let cam = Camera::new(800.0, 600.0);
        let (l, b, r, t) = cam.visible_bounds();
        assert!((l + r).abs() < 0.01);
        assert!((b + t).abs() < 0.01);
    }

    #[test]
    fn zoom_clamps() {
        let mut cam = Camera::new(800.0, 600.0);
        cam.zoom_at(0.001, 400.0, 300.0);
        assert!(cam.zoom >= cam.min_zoom);
        cam.zoom = 1.0;
        cam.zoom_at(1000.0, 400.0, 300.0);
        assert!(cam.zoom <= cam.max_zoom);
    }
}
