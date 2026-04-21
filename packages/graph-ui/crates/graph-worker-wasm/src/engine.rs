use std::collections::{HashMap, HashSet};

use graph_core::filter::GraphFilter;
use graph_core::graph::GraphStore;
use graph_core::search::SearchIndex;
use graph_core::types::{EdgeData, NodeData, NodeType, Status};
use graph_layout::incremental::place_added_nodes;
use graph_layout::{ForceLayout, GridLayout, HierarchicalLayout, LayoutEngine};

use crate::protocol::FilterIn;

// Grid layout defaults — typical node footprint plus padding. Width/height
// match the theme's default node size (110x38); padding provides a visual
// gutter. `viewport_ratio` is approximated at 16:9 (1.77) here because the
// worker does not know the live canvas aspect; the RenderEngine's `fit`
// normalizes whatever aspect the grid ends up at.
const GRID_PADDING: f32 = 20.0;
const GRID_NODE_W: f32 = 110.0;
const GRID_NODE_H: f32 = 38.0;
const GRID_VIEWPORT_RATIO: f32 = 1.77;

#[derive(Clone, Copy, PartialEq)]
enum LayoutKind {
    Force,
    Hierarchical,
    Grid,
}

pub struct WorkerEngine {
    store: GraphStore,
    search: SearchIndex,
    positions: HashMap<String, (f32, f32)>,
    node_order: Vec<String>,

    force_layout: ForceLayout,
    hier_layout: HierarchicalLayout,
    grid_layout: GridLayout,
    active_layout: LayoutKind,
    layout_running: bool,

    visible_nodes: Option<HashSet<String>>,
    spotlight_ids: HashSet<String>,
    show_hulls: bool,

    visual_flags: Vec<u8>,

    pinned: HashSet<usize>,
}

impl Default for WorkerEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl WorkerEngine {
    pub fn new() -> Self {
        Self {
            store: GraphStore::new(),
            search: SearchIndex::new(),
            positions: HashMap::new(),
            node_order: Vec::new(),
            force_layout: ForceLayout::new(),
            hier_layout: HierarchicalLayout::new(),
            grid_layout: GridLayout::new(
                GRID_PADDING,
                GRID_NODE_W,
                GRID_NODE_H,
                GRID_VIEWPORT_RATIO,
            ),
            active_layout: LayoutKind::Force,
            layout_running: false,
            visible_nodes: None,
            spotlight_ids: HashSet::new(),
            show_hulls: false,
            visual_flags: Vec::new(),
            pinned: HashSet::new(),
        }
    }

    pub fn node_count(&self) -> usize {
        self.store.node_count()
    }

    pub fn edge_count(&self) -> usize {
        self.store.edge_count()
    }

    pub fn is_layout_running(&self) -> bool {
        self.layout_running
    }

    pub fn load_snapshot(&mut self, nodes: Vec<NodeData>, edges: Vec<EdgeData>) {
        self.store = GraphStore::new();
        self.search.clear();
        self.positions.clear();
        self.node_order.clear();

        for node in nodes {
            self.search.insert(&node.id, &node.name);
            self.node_order.push(node.id.clone());
            self.store.add_node(node);
        }
        for edge in edges {
            self.store.add_edge(edge);
        }

        // Run the layout that was set via `set_layout`. Force is iterative and
        // keeps `layout_running=true` so the tick loop advances it; grid and
        // hierarchical are one-shot — their positions are final after `compute`.
        match self.active_layout {
            LayoutKind::Force => {
                self.force_layout = ForceLayout::new();
                self.layout_running = true;
                let result = self.force_layout.compute(&self.store);
                for (id, x, y) in result {
                    self.positions.insert(id, (x, y));
                }
            }
            LayoutKind::Hierarchical => {
                let result = self.hier_layout.compute(&self.store);
                for (id, x, y) in result {
                    self.positions.insert(id, (x, y));
                }
                self.layout_running = false;
            }
            LayoutKind::Grid => {
                self.grid_layout = GridLayout::new(
                    GRID_PADDING,
                    GRID_NODE_W,
                    GRID_NODE_H,
                    GRID_VIEWPORT_RATIO,
                );
                let result = self.grid_layout.compute(&self.store);
                for (id, x, y) in result {
                    self.positions.insert(id, (x, y));
                }
                self.layout_running = false;
            }
        }

        self.rebuild_visual_flags();
    }

    /// Reset the engine to the same state as `WorkerEngine::new()`, preserving
    /// only the layout engine instances (force_layout, hier_layout) so we avoid
    /// re-allocating them.
    pub fn clear_snapshot(&mut self) {
        self.store = GraphStore::new();
        self.search.clear();
        self.positions.clear();
        self.node_order.clear();
        self.visual_flags.clear();
        self.visible_nodes = None;
        self.spotlight_ids.clear();
        self.show_hulls = false;
        self.layout_running = false;
        self.pinned.clear();
    }

    pub fn tick(&mut self) -> bool {
        if !self.layout_running {
            return false;
        }

        match self.active_layout {
            LayoutKind::Force => {
                // Save pinned positions before the physics step.
                let pinned_saved: Vec<(String, (f32, f32))> =
                    self.pinned
                        .iter()
                        .filter_map(|&idx| {
                            self.node_order.get(idx).cloned().and_then(|id| {
                                self.positions.get(&id).copied().map(|pos| (id, pos))
                            })
                        })
                        .collect();

                let still_moving = self.force_layout.tick(&self.store);
                if !still_moving {
                    self.layout_running = false;
                }
                let result = self.force_layout.get_positions();
                for (id, x, y) in result {
                    self.positions.insert(id, (x, y));
                }

                // Restore pinned positions so physics cannot move them.
                for (id, (x, y)) in pinned_saved {
                    self.positions.insert(id, (x, y));
                }

                still_moving
            }
            LayoutKind::Hierarchical => {
                self.layout_running = false;
                false
            }
            LayoutKind::Grid => {
                // Grid is one-shot; positions are set in `set_layout`.
                self.layout_running = false;
                false
            }
        }
    }

    /// Mark a node as pinned and move it to the given position immediately.
    /// Restarts the layout so that neighboring nodes can reflow.
    pub fn pin_node(&mut self, idx: usize, x: f32, y: f32) {
        if let Some(id) = self.node_order.get(idx).cloned() {
            self.positions.insert(id, (x, y));
        }
        self.pinned.insert(idx);
        self.layout_running = true;
    }

    /// Remove a node from the pinned set so the force layout can move it again.
    pub fn unpin_node(&mut self, idx: usize) {
        self.pinned.remove(&idx);
    }

    pub fn set_layout(&mut self, layout: &str) {
        match layout {
            "hierarchical" => {
                self.active_layout = LayoutKind::Hierarchical;
                let result = self.hier_layout.compute(&self.store);
                for (id, x, y) in result {
                    self.positions.insert(id, (x, y));
                }
                self.layout_running = false;
            }
            "grid" => {
                self.active_layout = LayoutKind::Grid;
                // Fresh engine so converged flag resets and a re-issued
                // `set_layout=grid` recomputes even if no nodes changed.
                self.grid_layout = GridLayout::new(
                    GRID_PADDING,
                    GRID_NODE_W,
                    GRID_NODE_H,
                    GRID_VIEWPORT_RATIO,
                );
                let result = self.grid_layout.compute(&self.store);
                for (id, x, y) in result {
                    self.positions.insert(id, (x, y));
                }
                // Grid is one-shot and non-overlapping by construction.
                self.layout_running = false;
            }
            _ => {
                self.active_layout = LayoutKind::Force;
                self.force_layout = ForceLayout::new();
                self.layout_running = true;
            }
        }
    }

    pub fn set_filter(&mut self, filter: Option<FilterIn>) {
        match filter {
            None => self.visible_nodes = None,
            Some(f) => {
                let core_filter = GraphFilter {
                    types: f
                        .types
                        .map(|ts| ts.into_iter().filter_map(|t| parse_node_type(&t)).collect()),
                    domains: f.domains,
                    statuses: f
                        .status
                        .map(|ss| ss.into_iter().filter_map(|s| parse_status(&s)).collect()),
                };
                let ids = core_filter.apply(&self.store);
                self.visible_nodes = Some(ids.into_iter().collect());
            }
        }
        self.rebuild_visual_flags();
    }

    pub fn set_spotlight(&mut self, ids: Option<Vec<String>>) {
        match ids {
            None => self.spotlight_ids.clear(),
            Some(ids) => self.spotlight_ids = ids.into_iter().collect(),
        }
        self.rebuild_visual_flags();
    }

    pub fn set_communities(&mut self, show: bool) {
        self.show_hulls = show;
    }

    pub fn add_ws_nodes(&mut self, nodes: Vec<NodeData>, edges: Vec<EdgeData>) -> usize {
        let mut added = 0usize;
        for node in nodes {
            self.search.insert(&node.id, &node.name);
            if !self.node_order.contains(&node.id) {
                self.node_order.push(node.id.clone());
                added += 1;
            }
            self.store.add_node(node);
        }
        for edge in edges {
            self.store.add_edge(edge);
        }

        let new_ids: Vec<String> = self
            .node_order
            .iter()
            .filter(|id| !self.positions.contains_key(id.as_str()))
            .cloned()
            .collect();
        if !new_ids.is_empty() {
            let mut neighbor_map = HashMap::new();
            for id in &new_ids {
                let ns: Vec<String> = self
                    .store
                    .neighbors(id)
                    .iter()
                    .map(|n| n.id.clone())
                    .collect();
                neighbor_map.insert(id.clone(), ns);
            }
            let placed = place_added_nodes(&self.positions, &new_ids, &neighbor_map);
            for (id, x, y) in placed {
                self.positions.insert(id, (x, y));
            }
            if self.active_layout == LayoutKind::Force {
                self.layout_running = true;
            }
        }

        self.rebuild_visual_flags();
        added
    }

    pub fn remove_node(&mut self, id: &str) {
        self.store.remove_node(id);
        self.search.remove(id);
        self.node_order.retain(|n| n != id);
        self.positions.remove(id);
        self.rebuild_visual_flags();
    }

    pub fn get_position_buffer(&self) -> Vec<f32> {
        let visible = self.visible_node_indices();
        let mut buf = Vec::with_capacity(visible.len() * 4);
        for &idx in &visible {
            let id = &self.node_order[idx];
            let &(x, y) = self.positions.get(id).unwrap_or(&(0.0, 0.0));
            let type_index = self
                .store
                .get_node(id)
                .map(|n| node_type_index(&n.node_type))
                .unwrap_or(0.0);
            buf.extend_from_slice(&[x, y, 10.0, type_index]);
        }
        buf
    }

    pub fn get_visual_flags(&self) -> &[u8] {
        &self.visual_flags
    }

    pub fn visible_node_ids(&self) -> Vec<String> {
        self.visible_node_indices()
            .iter()
            .map(|&i| self.node_order[i].clone())
            .collect()
    }

    pub fn get_stats(&self) -> (usize, usize, usize) {
        let violations = self
            .store
            .nodes()
            .filter(|n| n.status == Status::Violation)
            .count();
        (self.store.node_count(), self.store.edge_count(), violations)
    }

    pub fn get_edge_buffer(&self) -> Vec<f32> {
        let visible_ids: HashSet<&str> = self
            .visible_node_indices()
            .iter()
            .map(|&i| self.node_order[i].as_str())
            .collect();

        let mut buf = Vec::new();
        for edge in self.store.edges() {
            if !visible_ids.contains(edge.source.as_str())
                || !visible_ids.contains(edge.target.as_str())
            {
                continue;
            }
            let Some(&(sx, sy)) = self.positions.get(&edge.source) else {
                continue;
            };
            let Some(&(tx, ty)) = self.positions.get(&edge.target) else {
                continue;
            };
            let type_index = edge_type_index(&edge.edge_type);
            buf.extend_from_slice(&[sx, sy, tx, ty, type_index, edge.weight]);
        }
        buf
    }

    fn visible_node_indices(&self) -> Vec<usize> {
        self.node_order
            .iter()
            .enumerate()
            .filter(|(_, id)| {
                self.visible_nodes
                    .as_ref()
                    .is_none_or(|v| v.contains(id.as_str()))
            })
            .map(|(i, _)| i)
            .collect()
    }

    fn rebuild_visual_flags(&mut self) {
        let visible = self.visible_node_indices();
        self.visual_flags = Vec::with_capacity(visible.len());
        for &idx in &visible {
            let id = &self.node_order[idx];
            let dimmed = !self.spotlight_ids.is_empty() && !self.spotlight_ids.contains(id);
            self.visual_flags.push(if dimmed { 1 } else { 0 });
        }
    }
}

fn node_type_index(nt: &NodeType) -> f32 {
    match nt {
        NodeType::Service => 0.0,
        NodeType::Database => 1.0,
        NodeType::Cache => 2.0,
        NodeType::External => 3.0,
        NodeType::Policy => 4.0,
        NodeType::Adr => 5.0,
        NodeType::Incident => 6.0,
    }
}

fn edge_type_index(et: &graph_core::types::EdgeType) -> f32 {
    match et {
        graph_core::types::EdgeType::DependsOn => 0.0,
        graph_core::types::EdgeType::Calls => 1.0,
        graph_core::types::EdgeType::Violation => 2.0,
        graph_core::types::EdgeType::Enforces => 3.0,
        graph_core::types::EdgeType::Drift => 4.0,
    }
}

fn parse_node_type(s: &str) -> Option<NodeType> {
    match s {
        "service" => Some(NodeType::Service),
        "database" => Some(NodeType::Database),
        "cache" => Some(NodeType::Cache),
        "external" => Some(NodeType::External),
        "policy" => Some(NodeType::Policy),
        "adr" => Some(NodeType::Adr),
        "incident" => Some(NodeType::Incident),
        _ => None,
    }
}

fn parse_status(s: &str) -> Option<Status> {
    match s {
        "healthy" => Some(Status::Healthy),
        "violation" => Some(Status::Violation),
        "warning" => Some(Status::Warning),
        "enforced" => Some(Status::Enforced),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use graph_core::types::{EdgeData, EdgeType, NodeData, NodeType, Status};

    fn make_node(id: &str) -> NodeData {
        NodeData {
            id: id.to_string(),
            name: id.to_string(),
            node_type: NodeType::Service,
            domain: "test".to_string(),
            status: Status::Healthy,
            community: None,
            meta: std::collections::HashMap::new(),
        }
    }

    fn make_edge(id: &str, src: &str, tgt: &str) -> EdgeData {
        EdgeData {
            id: id.to_string(),
            source: src.to_string(),
            target: tgt.to_string(),
            edge_type: EdgeType::DependsOn,
            label: "depends".to_string(),
            weight: 1.0,
        }
    }

    #[test]
    fn load_snapshot_produces_positions() {
        let mut engine = WorkerEngine::new();
        let nodes = vec![make_node("a"), make_node("b"), make_node("c")];
        let edges = vec![make_edge("e1", "a", "b")];
        engine.load_snapshot(nodes, edges);

        assert_eq!(engine.node_count(), 3);
        assert_eq!(engine.edge_count(), 1);

        let positions = engine.get_position_buffer();
        assert_eq!(positions.len(), 3 * 4);
        assert!(positions.iter().all(|v| v.is_finite()));
    }

    #[test]
    fn layout_tick_returns_positions() {
        let mut engine = WorkerEngine::new();
        let nodes = vec![make_node("a"), make_node("b")];
        engine.load_snapshot(nodes, vec![]);

        let _still_moving = engine.tick();
        let positions = engine.get_position_buffer();
        assert_eq!(positions.len(), 2 * 4);
    }

    #[test]
    fn filter_reduces_visible_set() {
        let mut engine = WorkerEngine::new();
        let mut node_a = make_node("a");
        node_a.node_type = NodeType::Service;
        let mut node_b = make_node("b");
        node_b.node_type = NodeType::Database;
        engine.load_snapshot(vec![node_a, node_b], vec![]);

        engine.set_filter(Some(FilterIn {
            types: Some(vec!["service".to_string()]),
            domains: None,
            status: None,
        }));

        let positions = engine.get_position_buffer();
        assert_eq!(positions.len(), 4);
    }

    #[test]
    fn edge_buffer_only_includes_visible_edges() {
        let mut engine = WorkerEngine::new();
        engine.load_snapshot(
            vec![make_node("a"), make_node("b"), make_node("c")],
            vec![make_edge("e1", "a", "b"), make_edge("e2", "b", "c")],
        );

        let buf = engine.get_edge_buffer();
        assert_eq!(buf.len(), 2 * 6);
    }

    #[test]
    fn add_ws_nodes_places_near_neighbors() {
        let mut engine = WorkerEngine::new();
        engine.load_snapshot(vec![make_node("a")], vec![]);

        let added = engine.add_ws_nodes(vec![make_node("b")], vec![make_edge("e1", "a", "b")]);
        assert_eq!(added, 1);
        assert_eq!(engine.node_count(), 2);

        let positions = engine.get_position_buffer();
        assert_eq!(positions.len(), 2 * 4);
    }

    #[test]
    fn spotlight_sets_visual_flags() {
        let mut engine = WorkerEngine::new();
        engine.load_snapshot(vec![make_node("a"), make_node("b")], vec![]);

        engine.set_spotlight(Some(vec!["a".to_string()]));
        let flags = engine.get_visual_flags();
        assert_eq!(flags.len(), 2);
        assert_eq!(flags[0], 0);
        assert_eq!(flags[1], 1);
    }

    #[test]
    fn pin_and_unpin_tracked() {
        let mut engine = WorkerEngine::new();
        engine.load_snapshot(vec![make_node("a"), make_node("b")], vec![]);

        // Pin node at index 0 to a specific position.
        engine.pin_node(0, 5.0, 5.0);
        assert!(engine.pinned.contains(&0));
        assert_eq!(engine.positions.get("a"), Some(&(5.0, 5.0)));
        // Pinning should restart layout.
        assert!(engine.is_layout_running());

        // Tick: pinned position must be preserved despite physics.
        engine.tick();
        assert_eq!(engine.positions.get("a"), Some(&(5.0, 5.0)));

        // Unpin: node should no longer be in the pinned set.
        engine.unpin_node(0);
        assert!(!engine.pinned.contains(&0));
    }

    #[test]
    fn clear_snapshot_clears_pinned() {
        let mut engine = WorkerEngine::new();
        engine.load_snapshot(vec![make_node("a"), make_node("b")], vec![]);
        engine.pin_node(0, 1.0, 2.0);
        assert!(!engine.pinned.is_empty());

        engine.clear_snapshot();
        assert!(engine.pinned.is_empty());
    }
}
