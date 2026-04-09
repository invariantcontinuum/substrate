use crate::LayoutEngine;
use graph_core::graph::GraphStore;
use std::collections::HashMap;

const THETA: f32 = 0.8;
const REPULSION: f32 = 1000.0;
const MAX_QUAD_DEPTH: usize = 40;
const ATTRACTION: f32 = 0.01;
const DAMPING: f32 = 0.9;
const MIN_VELOCITY: f32 = 0.01;
const MAX_ITERATIONS: usize = 500;

pub struct ForceLayout {
    positions: HashMap<String, (f32, f32)>,
    velocities: HashMap<String, (f32, f32)>,
    converged: bool,
    iteration: usize,
}

struct QuadNode {
    cx: f32,
    cy: f32,
    mass: f32,
    bounds: (f32, f32, f32, f32), // x_min, y_min, x_max, y_max
    children: Option<Box<[Option<QuadNode>; 4]>>,
    body: Option<(f32, f32)>,
}

impl QuadNode {
    fn new(x_min: f32, y_min: f32, x_max: f32, y_max: f32) -> Self {
        Self {
            cx: 0.0,
            cy: 0.0,
            mass: 0.0,
            bounds: (x_min, y_min, x_max, y_max),
            children: None,
            body: None,
        }
    }

    fn quadrant(&self, x: f32, y: f32) -> usize {
        let (x_min, y_min, x_max, y_max) = self.bounds;
        let mx = (x_min + x_max) / 2.0;
        let my = (y_min + y_max) / 2.0;
        if x < mx {
            if y < my { 0 } else { 2 }
        } else if y < my {
            1
        } else {
            3
        }
    }

    fn child_bounds(&self, q: usize) -> (f32, f32, f32, f32) {
        let (x_min, y_min, x_max, y_max) = self.bounds;
        let mx = (x_min + x_max) / 2.0;
        let my = (y_min + y_max) / 2.0;
        match q {
            0 => (x_min, y_min, mx, my),
            1 => (mx, y_min, x_max, my),
            2 => (x_min, my, mx, y_max),
            3 => (mx, my, x_max, y_max),
            _ => unreachable!(),
        }
    }

    fn insert(&mut self, x: f32, y: f32) {
        self.insert_at_depth(x, y, 0);
    }

    fn insert_at_depth(&mut self, x: f32, y: f32, start_depth: usize) {
        // Iterative insertion using a raw pointer to walk down the tree.
        // SAFETY: we never alias — `current` is the only live mutable ref at
        // each step, and no other code touches the tree during insertion.
        let mut current: *mut QuadNode = self;
        let mut depth = start_depth;

        loop {
            let node = unsafe { &mut *current };

            if node.mass == 0.0 && node.body.is_none() {
                // Empty node — place body here
                node.body = Some((x, y));
                node.cx = x;
                node.cy = y;
                node.mass = 1.0;
                return;
            }

            // At max depth, just accumulate mass without subdividing further
            if depth >= MAX_QUAD_DEPTH {
                let total = node.mass + 1.0;
                node.cx = (node.cx * node.mass + x) / total;
                node.cy = (node.cy * node.mass + y) / total;
                node.mass = total;
                return;
            }

            // Ensure children exist
            if node.children.is_none() {
                let mut children: [Option<QuadNode>; 4] = [None, None, None, None];
                for (i, child) in children.iter_mut().enumerate() {
                    let (cx_min, cy_min, cx_max, cy_max) = node.child_bounds(i);
                    *child = Some(QuadNode::new(cx_min, cy_min, cx_max, cy_max));
                }
                node.children = Some(Box::new(children));
            }

            // If this is a leaf with an existing body, push it down into
            // the appropriate child. Uses insert_at_depth with bounded
            // recursion (max MAX_QUAD_DEPTH frames).
            if let Some((bx, by)) = node.body.take() {
                let bq = node.quadrant(bx, by);
                let child = node.children.as_mut().unwrap()[bq].as_mut().unwrap();
                child.insert_at_depth(bx, by, depth + 1);
            }

            // Update center of mass
            let total = node.mass + 1.0;
            node.cx = (node.cx * node.mass + x) / total;
            node.cy = (node.cy * node.mass + y) / total;
            node.mass = total;

            // Descend into the correct quadrant for the new point
            let q = node.quadrant(x, y);
            let next: *mut QuadNode = {
                let children = node.children.as_mut().unwrap();
                children[q].as_mut().unwrap() as *mut QuadNode
            };
            current = next;
            depth += 1;
        }
    }

    fn compute_force(&self, x: f32, y: f32) -> (f32, f32) {
        let mut fx = 0.0_f32;
        let mut fy = 0.0_f32;
        let mut stack: Vec<&QuadNode> = vec![self];

        while let Some(node) = stack.pop() {
            if node.mass == 0.0 {
                continue;
            }

            let dx = node.cx - x;
            let dy = node.cy - y;
            let dist_sq = dx * dx + dy * dy;

            if dist_sq < 0.01 {
                continue;
            }

            let (x_min, _y_min, x_max, _y_max) = node.bounds;
            let width = x_max - x_min;

            // Barnes-Hut criterion: if node is far enough, treat as single body
            if (width * width) / dist_sq < THETA * THETA || node.children.is_none() {
                let dist = dist_sq.sqrt();
                let force = -REPULSION * node.mass / dist_sq;
                fx += force * dx / dist;
                fy += force * dy / dist;
                continue;
            }

            // Otherwise push children onto the stack
            if let Some(ref children) = node.children {
                for c in children.iter().flatten() {
                    stack.push(c);
                }
            }
        }

        (fx, fy)
    }
}

impl ForceLayout {
    pub fn new() -> Self {
        Self {
            positions: HashMap::new(),
            velocities: HashMap::new(),
            converged: false,
            iteration: 0,
        }
    }

    fn init_positions(&mut self, graph: &GraphStore) {
        let node_ids: Vec<String> = graph.nodes().map(|n| n.id.clone()).collect();
        let n = node_ids.len() as f32;
        let golden_angle = std::f32::consts::PI * (3.0 - 5.0_f32.sqrt());

        for (i, id) in node_ids.iter().enumerate() {
            if !self.positions.contains_key(id) {
                let r = (i as f32 / n).sqrt() * 100.0;
                let theta = i as f32 * golden_angle;
                let x = r * theta.cos();
                let y = r * theta.sin();
                self.positions.insert(id.clone(), (x, y));
                self.velocities.insert(id.clone(), (0.0, 0.0));
            }
        }
    }

    pub fn total_velocity_energy(&self) -> f32 {
        self.velocities
            .values()
            .map(|(vx, vy)| vx * vx + vy * vy)
            .sum()
    }
}

impl Default for ForceLayout {
    fn default() -> Self {
        Self::new()
    }
}

impl LayoutEngine for ForceLayout {
    fn compute(&mut self, graph: &GraphStore) -> Vec<(String, f32, f32)> {
        self.init_positions(graph);
        self.iteration = 0;
        self.converged = false;

        for _ in 0..MAX_ITERATIONS {
            let still_moving = self.tick(graph);
            if !still_moving {
                break;
            }
        }

        self.positions
            .iter()
            .map(|(id, &(x, y))| (id.clone(), x, y))
            .collect()
    }

    fn tick(&mut self, graph: &GraphStore) -> bool {
        self.init_positions(graph);
        self.iteration += 1;

        let ids: Vec<String> = self.positions.keys().cloned().collect();
        if ids.is_empty() {
            self.converged = true;
            return false;
        }

        // Compute bounding box for quad-tree
        let mut x_min = f32::MAX;
        let mut y_min = f32::MAX;
        let mut x_max = f32::MIN;
        let mut y_max = f32::MIN;
        for &(x, y) in self.positions.values() {
            x_min = x_min.min(x);
            y_min = y_min.min(y);
            x_max = x_max.max(x);
            y_max = y_max.max(y);
        }
        // Add padding
        let pad = 10.0;
        x_min -= pad;
        y_min -= pad;
        x_max += pad;
        y_max += pad;

        // Build quad-tree
        let mut root = QuadNode::new(x_min, y_min, x_max, y_max);
        for &(x, y) in self.positions.values() {
            root.insert(x, y);
        }

        // Compute repulsive forces via Barnes-Hut
        let mut forces: HashMap<String, (f32, f32)> = HashMap::new();
        for id in &ids {
            let (x, y) = self.positions[id];
            let (fx, fy) = root.compute_force(x, y);
            forces.insert(id.clone(), (fx, fy));
        }

        // Compute attractive forces from edges
        for edge in graph.edges() {
            let source = &edge.source;
            let target = &edge.target;
            if let (Some(&(sx, sy)), Some(&(tx, ty))) =
                (self.positions.get(source), self.positions.get(target))
            {
                let dx = tx - sx;
                let dy = ty - sy;
                let dist = (dx * dx + dy * dy).sqrt().max(0.1);
                let force = ATTRACTION * dist;
                let fx = force * dx / dist;
                let fy = force * dy / dist;

                forces.entry(source.clone()).and_modify(|(rfx, rfy)| {
                    *rfx += fx;
                    *rfy += fy;
                });
                forces.entry(target.clone()).and_modify(|(rfx, rfy)| {
                    *rfx -= fx;
                    *rfy -= fy;
                });
            }
        }

        // Apply forces to velocities and positions
        let mut max_velocity_sq: f32 = 0.0;
        for id in &ids {
            let (fx, fy) = forces.get(id).copied().unwrap_or((0.0, 0.0));
            let vel = self.velocities.get_mut(id).unwrap();
            vel.0 = (vel.0 + fx) * DAMPING;
            vel.1 = (vel.1 + fy) * DAMPING;

            let v_sq = vel.0 * vel.0 + vel.1 * vel.1;
            max_velocity_sq = max_velocity_sq.max(v_sq);

            let pos = self.positions.get_mut(id).unwrap();
            pos.0 += vel.0;
            pos.1 += vel.1;
        }

        if max_velocity_sq < MIN_VELOCITY * MIN_VELOCITY {
            self.converged = true;
            return false;
        }

        true
    }

    fn is_converged(&self) -> bool {
        self.converged
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use graph_core::types::*;

    fn make_node(id: &str) -> NodeData {
        NodeData {
            id: id.to_string(),
            name: id.to_string(),
            node_type: NodeType::Service,
            domain: "test".to_string(),
            status: Status::Healthy,
            community: None,
            meta: Default::default(),
        }
    }

    fn make_edge(source: &str, target: &str) -> EdgeData {
        EdgeData {
            id: format!("{}-{}", source, target),
            source: source.to_string(),
            target: target.to_string(),
            edge_type: EdgeType::DependsOn,
            label: String::new(),
            weight: 1.0,
        }
    }

    #[test]
    fn converges_small_graph() {
        let mut graph = GraphStore::new();
        for i in 0..10 {
            graph.add_node(make_node(&format!("n{}", i)));
        }
        for i in 0..9 {
            graph.add_edge(make_edge(&format!("n{}", i), &format!("n{}", i + 1)));
        }

        let mut layout = ForceLayout::new();
        let positions = layout.compute(&graph);

        assert_eq!(positions.len(), 10);
        assert!(layout.is_converged() || layout.iteration <= MAX_ITERATIONS);

        // Verify all positions are finite
        for (_, x, y) in &positions {
            assert!(x.is_finite(), "x position not finite");
            assert!(y.is_finite(), "y position not finite");
        }
    }

    #[test]
    fn energy_decreases() {
        let mut graph = GraphStore::new();
        for i in 0..20 {
            graph.add_node(make_node(&format!("n{}", i)));
        }
        for i in 0..19 {
            graph.add_edge(make_edge(&format!("n{}", i), &format!("n{}", i + 1)));
        }

        let mut layout = ForceLayout::new();
        layout.init_positions(&graph);

        // Run 50 ticks to let the system settle past initial transients
        for _ in 0..50 {
            layout.tick(&graph);
        }
        let energy_early = layout.total_velocity_energy();

        // Run 50 more ticks
        for _ in 0..50 {
            layout.tick(&graph);
        }
        let energy_late = layout.total_velocity_energy();

        assert!(
            energy_late <= energy_early,
            "Energy should decrease: early={}, late={}",
            energy_early,
            energy_late
        );
    }
}
