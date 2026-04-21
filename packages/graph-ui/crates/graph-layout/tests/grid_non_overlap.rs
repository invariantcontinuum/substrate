use graph_core::graph::GraphStore;
use graph_core::types::{NodeData, NodeType, Status};
use graph_layout::{GridLayout, LayoutEngine};
use std::collections::HashMap;

fn node(id: &str, t: NodeType) -> NodeData {
    NodeData {
        id: id.to_string(),
        name: id.to_string(),
        node_type: t,
        domain: "test".into(),
        status: Status::Healthy,
        community: None,
        meta: HashMap::new(),
    }
}

fn positions_from(store: &GraphStore, mut layout: GridLayout) -> Vec<(String, f32, f32)> {
    layout.compute(store)
}

/// Node AABB is 100x40 for every node (matches typical theme defaults in tests).
const W: f32 = 100.0;
const H: f32 = 40.0;

fn aabbs_overlap(a: (f32, f32), b: (f32, f32)) -> bool {
    let dx = (a.0 - b.0).abs();
    let dy = (a.1 - b.1).abs();
    dx < W && dy < H
}

#[test]
fn grid_layout_no_overlap_for_various_sizes() {
    for n in [1usize, 10, 100, 1_000, 10_000] {
        for ratio in [0.5_f32, 1.0, 1.77, 2.0] {
            let mut store = GraphStore::new();
            for i in 0..n {
                store.add_node(node(&format!("n{i}"), NodeType::Service));
            }
            let mut layout = GridLayout::new(20.0, W, H, ratio);
            let positions = layout.compute(&store);
            assert_eq!(positions.len(), n, "n={n} ratio={ratio}");

            // O(n^2) only for n<=1000; sweep-line for larger.
            if n <= 1000 {
                for i in 0..positions.len() {
                    for j in (i + 1)..positions.len() {
                        let a = (positions[i].1, positions[i].2);
                        let b = (positions[j].1, positions[j].2);
                        assert!(
                            !aabbs_overlap(a, b),
                            "overlap at n={n} ratio={ratio}: {:?} vs {:?}",
                            positions[i], positions[j]
                        );
                    }
                }
            } else {
                // Larger n — check grid structure instead: unique (col, row) cells.
                let mut seen = std::collections::HashSet::new();
                for (_, x, y) in &positions {
                    let col = (x / (W + 20.0)).round() as i32;
                    let row = (y / (H + 20.0)).round() as i32;
                    assert!(seen.insert((col, row)), "duplicate cell at n={n}");
                }
            }
        }
    }
}

#[test]
fn grid_layout_is_centered_on_origin() {
    let mut store = GraphStore::new();
    for i in 0..16 {
        store.add_node(node(&format!("n{i}"), NodeType::Service));
    }
    let mut layout = GridLayout::new(20.0, W, H, 1.0);
    let positions = layout.compute(&store);

    let avg_x: f32 = positions.iter().map(|p| p.1).sum::<f32>() / positions.len() as f32;
    let avg_y: f32 = positions.iter().map(|p| p.2).sum::<f32>() / positions.len() as f32;
    assert!(avg_x.abs() < 1.0, "avg_x={avg_x}");
    assert!(avg_y.abs() < 1.0, "avg_y={avg_y}");
}
