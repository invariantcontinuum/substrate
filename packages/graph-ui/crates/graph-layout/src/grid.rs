use crate::LayoutEngine;
use graph_core::graph::GraphStore;

/// Viewport-aware grid layout. Non-overlap is guaranteed by construction: every
/// node is placed in its own cell, each cell is sized to max_node_w+padding by
/// max_node_h+padding, origin-centered on (0,0). Node order is the iteration
/// order of `GraphStore::nodes()`.
pub struct GridLayout {
    pub padding: f32,
    pub node_w: f32,
    pub node_h: f32,
    pub viewport_ratio: f32,
    converged: bool,
}

impl GridLayout {
    pub fn new(padding: f32, node_w: f32, node_h: f32, viewport_ratio: f32) -> Self {
        Self {
            padding,
            node_w,
            node_h,
            viewport_ratio: viewport_ratio.max(0.1),
            converged: false,
        }
    }
}

impl LayoutEngine for GridLayout {
    fn compute(&mut self, graph: &GraphStore) -> Vec<(String, f32, f32)> {
        let nodes: Vec<&graph_core::types::NodeData> = graph.nodes().collect();
        let n = nodes.len();
        if n == 0 {
            self.converged = true;
            return Vec::new();
        }

        let cols = ((n as f32 * self.viewport_ratio).sqrt().ceil() as usize).max(1);
        let rows = ((n as f32 / cols as f32).ceil() as usize).max(1);

        let cell_w = self.node_w + self.padding;
        let cell_h = self.node_h + self.padding;

        let total_w = cell_w * cols as f32;
        let total_h = cell_h * rows as f32;

        let origin_x = -total_w / 2.0 + cell_w / 2.0;
        let origin_y = -total_h / 2.0 + cell_h / 2.0;

        let mut out = Vec::with_capacity(n);
        for (rank, node) in nodes.iter().enumerate() {
            let row = rank / cols;
            let col = rank % cols;
            let x = origin_x + col as f32 * cell_w;
            let y = origin_y + row as f32 * cell_h;
            out.push((node.id.clone(), x, y));
        }

        self.converged = true;
        out
    }

    fn tick(&mut self, graph: &GraphStore) -> bool {
        // Grid is one-shot. If already computed, it's converged.
        if !self.converged {
            let _ = self.compute(graph);
        }
        true
    }

    fn is_converged(&self) -> bool {
        self.converged
    }
}
