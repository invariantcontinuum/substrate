use crate::LayoutEngine;
use graph_core::graph::GraphStore;
use std::collections::{HashSet, VecDeque};

/// Viewport-aware grid layout with **graph-aware ordering**: node placement
/// follows a BFS walk from the highest-degree seed so that 1-hop neighbors
/// end up in adjacent grid cells wherever the row width allows. Unconnected
/// components are emitted back-to-back in descending-degree order so they
/// form coherent regions rather than being scattered alphabetically.
///
/// Non-overlap is guaranteed by construction: every node gets its own cell
/// of `(node_w + padding) × (node_h + padding)`, origin-centered on (0,0).
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

/// Produce a node-id ordering that places each node adjacent to its graph
/// neighbors wherever possible. Algorithm:
///
/// 1. Rank nodes by degree (desc).
/// 2. For each unvisited root in that order, run BFS and emit the traversal
///    order (which puts any node right after its neighbors' parent chain).
/// 3. Ties inside BFS levels break by degree desc → node-id asc for stability.
///
/// Connected components are emitted back-to-back; the caller is responsible
/// for placing them in a grid — the ordering here guarantees each component
/// occupies a contiguous range of cells.
fn graph_aware_order(graph: &GraphStore) -> Vec<String> {
    let all_ids: Vec<String> = graph.nodes().map(|n| n.id.clone()).collect();
    if all_ids.is_empty() {
        return Vec::new();
    }

    // Degree map — O(V + E).
    let mut degree: std::collections::HashMap<String, usize> =
        std::collections::HashMap::with_capacity(all_ids.len());
    for id in &all_ids {
        degree.insert(id.clone(), graph.neighbors(id).len());
    }

    // Seed order: nodes ranked by degree desc, id asc for stability.
    let mut seeds: Vec<String> = all_ids.clone();
    seeds.sort_by(|a, b| {
        let da = degree.get(a).copied().unwrap_or(0);
        let db = degree.get(b).copied().unwrap_or(0);
        db.cmp(&da).then_with(|| a.cmp(b))
    });

    let mut visited: HashSet<String> = HashSet::with_capacity(all_ids.len());
    let mut out: Vec<String> = Vec::with_capacity(all_ids.len());

    for root in &seeds {
        if visited.contains(root) {
            continue;
        }
        let mut queue: VecDeque<String> = VecDeque::new();
        queue.push_back(root.clone());
        visited.insert(root.clone());

        while let Some(cur) = queue.pop_front() {
            out.push(cur.clone());
            // Enqueue unvisited neighbors sorted by (degree desc, id asc) so
            // the layout is deterministic across reloads.
            let mut ns: Vec<(String, usize)> = graph
                .neighbors(&cur)
                .iter()
                .filter(|n| !visited.contains(&n.id))
                .map(|n| (n.id.clone(), degree.get(&n.id).copied().unwrap_or(0)))
                .collect();
            ns.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
            for (id, _) in ns {
                if visited.insert(id.clone()) {
                    queue.push_back(id);
                }
            }
        }
    }

    out
}

impl LayoutEngine for GridLayout {
    fn compute(&mut self, graph: &GraphStore) -> Vec<(String, f32, f32)> {
        let ordering = graph_aware_order(graph);
        let n = ordering.len();
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
        for (rank, id) in ordering.iter().enumerate() {
            let row = rank / cols;
            let col = rank % cols;
            let x = origin_x + col as f32 * cell_w;
            let y = origin_y + row as f32 * cell_h;
            out.push((id.clone(), x, y));
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
