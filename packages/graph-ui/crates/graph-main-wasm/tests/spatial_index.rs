// Pure-Rust test of SpatialGrid + the engine invariant:
// after every `update_positions`, `spatial` is rebuilt so `pick()` returns
// the correct node index for every node's center.

use graph_main_wasm::spatial::SpatialGrid;

#[test]
fn pick_returns_every_node_after_rebuild() {
    // stride-4: [x, y, radius, type_idx]
    let positions: Vec<f32> = (0..100)
        .flat_map(|i| {
            let x = (i % 10) as f32 * 120.0 - 600.0;
            let y = (i / 10) as f32 * 50.0 - 250.0;
            [x, y, 20.0, 0.0]
        })
        .collect();

    let mut grid = SpatialGrid::new();
    grid.rebuild(&positions, 200);

    for i in 0..100 {
        let cx = positions[i * 4];
        let cy = positions[i * 4 + 1];
        let pick = grid.pick(cx, cy, &positions, 25.0);
        assert_eq!(pick, Some(i), "node {} at ({cx},{cy}) not picked", i);
    }
}

#[test]
fn pick_returns_none_far_from_any_node() {
    let positions: Vec<f32> = (0..10)
        .flat_map(|i| [i as f32 * 100.0, 0.0, 20.0, 0.0])
        .collect();
    let mut grid = SpatialGrid::new();
    grid.rebuild(&positions, 200);

    assert_eq!(grid.pick(10_000.0, 10_000.0, &positions, 25.0), None);
}
