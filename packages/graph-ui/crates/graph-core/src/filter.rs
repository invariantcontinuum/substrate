use crate::graph::GraphStore;
use crate::types::{NodeType, Status};

#[derive(Debug, Clone, Default)]
pub struct GraphFilter {
    pub types: Option<Vec<NodeType>>,
    pub domains: Option<Vec<String>>,
    pub statuses: Option<Vec<Status>>,
}

impl GraphFilter {
    pub fn apply(&self, graph: &GraphStore) -> Vec<String> {
        graph
            .nodes()
            .filter(|n| {
                self.types.as_ref().is_none_or(|t| t.contains(&n.node_type))
                    && self.domains.as_ref().is_none_or(|d| d.contains(&n.domain))
                    && self.statuses.as_ref().is_none_or(|s| s.contains(&n.status))
            })
            .map(|n| n.id.clone())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::GraphStore;
    use crate::types::*;

    fn make_node(id: &str, nt: NodeType, domain: &str, status: Status) -> NodeData {
        NodeData {
            id: id.into(),
            name: id.into(),
            node_type: nt,
            domain: domain.into(),
            status,
            community: None,
            meta: Default::default(),
        }
    }

    #[test]
    fn filter_by_type() {
        let mut g = GraphStore::new();
        g.add_node(make_node("s1", NodeType::Service, "pay", Status::Healthy));
        g.add_node(make_node("d1", NodeType::Database, "pay", Status::Healthy));
        let f = GraphFilter {
            types: Some(vec![NodeType::Service]),
            ..Default::default()
        };
        assert_eq!(f.apply(&g), vec!["s1"]);
    }

    #[test]
    fn filter_by_domain_and_status() {
        let mut g = GraphStore::new();
        g.add_node(make_node("s1", NodeType::Service, "pay", Status::Healthy));
        g.add_node(make_node(
            "s2",
            NodeType::Service,
            "auth",
            Status::Violation,
        ));
        g.add_node(make_node("s3", NodeType::Service, "pay", Status::Violation));
        let f = GraphFilter {
            domains: Some(vec!["pay".into()]),
            statuses: Some(vec![Status::Violation]),
            ..Default::default()
        };
        assert_eq!(f.apply(&g), vec!["s3"]);
    }
}
