use graph_render::camera::Camera;

#[test]
fn fit_to_bounds_centers_graph_and_fits_in_viewport() {
    let mut cam = Camera::new(800.0, 600.0);
    // Graph AABB far from origin, 4000×2000 in size.
    cam.fit_to_bounds(1000.0, -500.0, 5000.0, 1500.0, 40.0);

    // Camera center should land at the graph AABB midpoint (3000, 500).
    assert!((cam.x - 3000.0).abs() < 1.0, "cam.x={}", cam.x);
    assert!((cam.y - 500.0).abs() < 1.0, "cam.y={}", cam.y);

    // Zoom should be such that graph fits with padding.
    // viewport=800x600; graph+2*padding ≈ 4080x2080; scale = min(800/4080, 600/2080) ≈ 0.196
    assert!(cam.zoom > 0.15 && cam.zoom < 0.25, "zoom={}", cam.zoom);
}

#[test]
fn pan_is_clamped_so_at_least_25pct_stays_on_screen() {
    let mut cam = Camera::new(800.0, 600.0);
    cam.set_world_bounds(-500.0, -500.0, 500.0, 500.0);
    cam.fit_to_bounds(-500.0, -500.0, 500.0, 500.0, 0.0);

    // Try to pan the graph fully off-screen.
    for _ in 0..100 {
        cam.pan_clamped(100000.0, 0.0);
    }

    // The graph AABB (1000x1000 in world) should still be partly visible:
    // at least 25% of it intersecting the viewport.
    let (vxa, vya, vxb, vyb) = cam.visible_bounds();
    let ix_a = (-500.0f32).max(vxa);
    let ix_b = (500.0f32).min(vxb);
    let iy_a = (-500.0f32).max(vya);
    let iy_b = (500.0f32).min(vyb);
    let inter_w = (ix_b - ix_a).max(0.0);
    let inter_h = (iy_b - iy_a).max(0.0);
    let inter_area = inter_w * inter_h;
    let graph_area = 1000.0 * 1000.0;
    assert!(
        inter_area / graph_area >= 0.25,
        "visible_fraction={}",
        inter_area / graph_area
    );
}

#[test]
fn zoom_is_clamped_to_valid_range() {
    let mut cam = Camera::new(800.0, 600.0);
    // Fit a pathologically tiny graph → zoom would blow past max.
    cam.fit_to_bounds(0.0, 0.0, 0.001, 0.001, 0.0);
    assert!(cam.zoom <= 8.0, "zoom={}", cam.zoom);
    assert!(cam.zoom >= 0.05, "zoom={}", cam.zoom);
    // Tight assertion: for a sub-pixel graph, the clamp should land at the upper bound.
    assert!(
        (cam.zoom - 8.0).abs() < 1e-5,
        "expected zoom clamped to 8.0, got {}",
        cam.zoom
    );
}
