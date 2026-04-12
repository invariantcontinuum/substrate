use crate::types::{EdgeData, NodeData};
use petgraph::graph::{DiGraph, NodeIndex};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegendEntry {
    pub type_key: String,
    pub label: String,
    pub count: usize,
    pub color: String,
    pub border_color: String,
    pub shape: String,
    pub dash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegendSummary {
    pub node_types: Vec<LegendEntry>,
    pub edge_types: Vec<LegendEntry>,
}

pub struct GraphStore {
    graph: DiGraph<NodeData, EdgeData>,
    node_index: HashMap<String, NodeIndex>,
}

impl GraphStore {
    pub fn new() -> Self {
        Self {
            graph: DiGraph::new(),
            node_index: HashMap::new(),
        }
    }

    pub fn add_node(&mut self, data: NodeData) -> NodeIndex {
        let id = data.id.clone();
        if let Some(&idx) = self.node_index.get(&id) {
            *self.graph.node_weight_mut(idx).unwrap() = data;
            return idx;
        }
        let idx = self.graph.add_node(data);
        self.node_index.insert(id, idx);
        idx
    }

    pub fn remove_node(&mut self, id: &str) -> bool {
        if let Some(idx) = self.node_index.remove(id) {
            self.graph.remove_node(idx);
            // petgraph swaps the last node into the removed slot — fix index
            let _last_idx: NodeIndex = NodeIndex::new(self.graph.node_count());
            if let Some(swapped) = self.graph.node_weight(idx) {
                let swapped_id = swapped.id.clone();
                self.node_index.insert(swapped_id, idx);
            }
            true
        } else {
            false
        }
    }

    pub fn add_edge(&mut self, data: EdgeData) -> bool {
        let source = self.node_index.get(&data.source).copied();
        let target = self.node_index.get(&data.target).copied();
        if let (Some(s), Some(t)) = (source, target) {
            self.graph.add_edge(s, t, data);
            true
        } else {
            false
        }
    }

    pub fn get_node(&self, id: &str) -> Option<&NodeData> {
        self.node_index
            .get(id)
            .and_then(|&idx| self.graph.node_weight(idx))
    }

    pub fn get_node_mut(&mut self, id: &str) -> Option<&mut NodeData> {
        self.node_index
            .get(id)
            .copied()
            .and_then(|idx| self.graph.node_weight_mut(idx))
    }

    pub fn node_count(&self) -> usize {
        self.graph.node_count()
    }

    pub fn edge_count(&self) -> usize {
        self.graph.edge_count()
    }

    pub fn node_index(&self, id: &str) -> Option<NodeIndex> {
        self.node_index.get(id).copied()
    }

    pub fn inner(&self) -> &DiGraph<NodeData, EdgeData> {
        &self.graph
    }

    pub fn nodes(&self) -> impl Iterator<Item = &NodeData> {
        self.graph.node_weights()
    }

    pub fn edges(&self) -> impl Iterator<Item = &EdgeData> {
        self.graph.edge_weights()
    }

    pub fn neighbors(&self, id: &str) -> Vec<&NodeData> {
        let Some(&idx) = self.node_index.get(id) else {
            return vec![];
        };
        self.graph
            .neighbors_undirected(idx)
            .filter_map(|n| self.graph.node_weight(n))
            .collect()
    }

    /// Build a skeleton `LegendSummary` from node-type and edge-type counts.
    /// Callers (typically `graph-main-wasm`) fill in the style fields (color,
    /// border_color, shape, dash) from their theme — graph-core has no theme
    /// awareness.
    pub fn legend_summary_from_counts(
        node_counts: &HashMap<String, usize>,
        edge_counts: &HashMap<String, usize>,
    ) -> LegendSummary {
        let mut node_types: Vec<LegendEntry> = node_counts
            .iter()
            .map(|(type_key, count)| LegendEntry {
                type_key: type_key.clone(),
                label: type_key.clone(),
                count: *count,
                color: String::new(),
                border_color: String::new(),
                shape: String::new(),
                dash: None,
            })
            .collect();
        node_types.sort_by(|a, b| a.type_key.cmp(&b.type_key));

        let mut edge_types: Vec<LegendEntry> = edge_counts
            .iter()
            .map(|(type_key, count)| LegendEntry {
                type_key: type_key.clone(),
                label: type_key.replace('_', " "),
                count: *count,
                color: String::new(),
                border_color: String::new(),
                shape: String::new(),
                dash: None,
            })
            .collect();
        edge_types.sort_by(|a, b| a.type_key.cmp(&b.type_key));

        LegendSummary { node_types, edge_types }
    }
}

impl Default for GraphStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod legend_tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn legend_summary_counts_and_sorts() {
        let mut nodes = HashMap::new();
        nodes.insert("service".to_string(), 3);
        nodes.insert("database".to_string(), 1);
        let edges = HashMap::new();

        let s = GraphStore::legend_summary_from_counts(&nodes, &edges);

        assert_eq!(s.node_types.len(), 2);
        // sorted alphabetically: database before service
        assert_eq!(s.node_types[0].type_key, "database");
        assert_eq!(s.node_types[0].count, 1);
        assert_eq!(s.node_types[1].type_key, "service");
        assert_eq!(s.node_types[1].count, 3);
        assert_eq!(s.edge_types.len(), 0);
    }

    #[test]
    fn edge_type_label_replaces_underscores() {
        let nodes = HashMap::new();
        let mut edges = HashMap::new();
        edges.insert("depends_on".to_string(), 5);

        let s = GraphStore::legend_summary_from_counts(&nodes, &edges);
        assert_eq!(s.edge_types[0].type_key, "depends_on");
        assert_eq!(s.edge_types[0].label, "depends on");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;

    fn make_node(id: &str, node_type: NodeType) -> NodeData {
        NodeData {
            id: id.to_string(),
            name: id.to_string(),
            node_type,
            domain: "test".to_string(),
            status: Status::Healthy,
            community: None,
            meta: Default::default(),
        }
    }

    fn make_edge(id: &str, source: &str, target: &str) -> EdgeData {
        EdgeData {
            id: id.to_string(),
            source: source.to_string(),
            target: target.to_string(),
            edge_type: EdgeType::DependsOn,
            label: String::new(),
            weight: 1.0,
        }
    }

    #[test]
    fn add_and_get_node() {
        let mut g = GraphStore::new();
        g.add_node(make_node("svc-1", NodeType::Service));
        assert_eq!(g.node_count(), 1);
        assert_eq!(g.get_node("svc-1").unwrap().node_type, NodeType::Service);
    }

    #[test]
    fn add_edge_between_nodes() {
        let mut g = GraphStore::new();
        g.add_node(make_node("a", NodeType::Service));
        g.add_node(make_node("b", NodeType::Database));
        assert!(g.add_edge(make_edge("e1", "a", "b")));
        assert_eq!(g.edge_count(), 1);
    }

    #[test]
    fn edge_fails_with_missing_node() {
        let mut g = GraphStore::new();
        g.add_node(make_node("a", NodeType::Service));
        assert!(!g.add_edge(make_edge("e1", "a", "missing")));
    }

    #[test]
    fn remove_node() {
        let mut g = GraphStore::new();
        g.add_node(make_node("a", NodeType::Service));
        g.add_node(make_node("b", NodeType::Database));
        assert!(g.remove_node("a"));
        assert_eq!(g.node_count(), 1);
        assert!(g.get_node("a").is_none());
        assert!(g.get_node("b").is_some());
    }

    #[test]
    fn neighbors() {
        let mut g = GraphStore::new();
        g.add_node(make_node("a", NodeType::Service));
        g.add_node(make_node("b", NodeType::Database));
        g.add_node(make_node("c", NodeType::Cache));
        g.add_edge(make_edge("e1", "a", "b"));
        g.add_edge(make_edge("e2", "a", "c"));
        let neighbors = g.neighbors("a");
        assert_eq!(neighbors.len(), 2);
    }

    #[test]
    fn upsert_node() {
        let mut g = GraphStore::new();
        g.add_node(make_node("a", NodeType::Service));
        let mut updated = make_node("a", NodeType::Service);
        updated.status = Status::Violation;
        g.add_node(updated);
        assert_eq!(g.node_count(), 1);
        assert_eq!(g.get_node("a").unwrap().status, Status::Violation);
    }
}
