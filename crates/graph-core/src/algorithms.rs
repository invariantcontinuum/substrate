use std::collections::{HashMap, HashSet, VecDeque};
use crate::graph::GraphStore;

/// BFS from a node, returning all reachable node IDs within `max_depth` hops.
pub fn bfs_within(graph: &GraphStore, start_id: &str, max_depth: usize) -> Vec<String> {
    let Some(start) = graph.node_index(start_id) else { return vec![] };
    let inner = graph.inner();
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    queue.push_back((start, 0usize));
    visited.insert(start);
    let mut result = Vec::new();
    while let Some((node, depth)) = queue.pop_front() {
        if let Some(data) = inner.node_weight(node) {
            result.push(data.id.clone());
        }
        if depth >= max_depth { continue; }
        for neighbor in inner.neighbors_undirected(node) {
            if visited.insert(neighbor) {
                queue.push_back((neighbor, depth + 1));
            }
        }
    }
    result
}

/// Find shortest path between two nodes via BFS. Returns ordered list of node IDs.
pub fn shortest_path(graph: &GraphStore, from_id: &str, to_id: &str) -> Option<Vec<String>> {
    let from = graph.node_index(from_id)?;
    let to = graph.node_index(to_id)?;
    let inner = graph.inner();
    let mut visited: HashMap<petgraph::graph::NodeIndex, Option<petgraph::graph::NodeIndex>> = HashMap::new();
    let mut queue = VecDeque::new();
    queue.push_back(from);
    visited.insert(from, None);
    while let Some(current) = queue.pop_front() {
        if current == to {
            let mut path = Vec::new();
            let mut cur = Some(current);
            while let Some(node) = cur {
                if let Some(data) = inner.node_weight(node) {
                    path.push(data.id.clone());
                }
                cur = visited.get(&node).copied().flatten();
            }
            path.reverse();
            return Some(path);
        }
        for neighbor in inner.neighbors_undirected(current) {
            if !visited.contains_key(&neighbor) {
                visited.insert(neighbor, Some(current));
                queue.push_back(neighbor);
            }
        }
    }
    None
}

/// Extract edge IDs connecting a subset of nodes.
pub fn subgraph_edge_ids(graph: &GraphStore, node_ids: &[String]) -> Vec<String> {
    let id_set: HashSet<&str> = node_ids.iter().map(|s| s.as_str()).collect();
    graph.edges()
        .filter(|e| id_set.contains(e.source.as_str()) && id_set.contains(e.target.as_str()))
        .map(|e| e.id.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;
    use crate::graph::GraphStore;

    fn make_node(id: &str) -> NodeData {
        NodeData { id: id.into(), name: id.into(), node_type: NodeType::Service, domain: "test".into(), status: Status::Healthy, community: None, meta: Default::default() }
    }
    fn make_edge(id: &str, src: &str, tgt: &str) -> EdgeData {
        EdgeData { id: id.into(), source: src.into(), target: tgt.into(), edge_type: EdgeType::DependsOn, label: String::new(), weight: 1.0 }
    }
    fn build_chain() -> GraphStore {
        let mut g = GraphStore::new();
        for id in ["a","b","c","d"] { g.add_node(make_node(id)); }
        g.add_edge(make_edge("e1","a","b"));
        g.add_edge(make_edge("e2","b","c"));
        g.add_edge(make_edge("e3","c","d"));
        g
    }

    #[test]
    fn bfs_within_depth_1() {
        let g = build_chain();
        let result = bfs_within(&g, "b", 1);
        assert!(result.contains(&"b".into()));
        assert!(result.contains(&"a".into()));
        assert!(result.contains(&"c".into()));
        assert!(!result.contains(&"d".into()));
    }

    #[test]
    fn shortest_path_chain() {
        let g = build_chain();
        let path = shortest_path(&g, "a", "d").unwrap();
        assert_eq!(path, vec!["a","b","c","d"]);
    }

    #[test]
    fn shortest_path_no_route() {
        let mut g = GraphStore::new();
        g.add_node(make_node("a"));
        g.add_node(make_node("b"));
        assert!(shortest_path(&g, "a", "b").is_none());
    }

    #[test]
    fn subgraph_edges() {
        let g = build_chain();
        let edges = subgraph_edge_ids(&g, &["a".into(),"b".into(),"c".into()]);
        assert_eq!(edges.len(), 2);
    }
}
