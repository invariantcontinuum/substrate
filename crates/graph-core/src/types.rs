use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    Service,
    Database,
    Cache,
    External,
    Policy,
    Adr,
    Incident,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EdgeType {
    DependsOn,
    Calls,
    Violation,
    Enforces,
    Drift,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Healthy,
    Violation,
    Warning,
    Enforced,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeData {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub domain: String,
    pub status: Status,
    #[serde(default)]
    pub community: Option<u32>,
    #[serde(default)]
    pub meta: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeData {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(rename = "type")]
    pub edge_type: EdgeType,
    #[serde(default)]
    pub label: String,
    #[serde(default = "default_weight")]
    pub weight: f32,
}

fn default_weight() -> f32 {
    1.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_node_data() {
        let json = r#"{
            "id": "svc-42",
            "name": "PaymentService",
            "type": "service",
            "domain": "payments",
            "status": "healthy",
            "community": 7,
            "meta": {}
        }"#;
        let node: NodeData = serde_json::from_str(json).unwrap();
        assert_eq!(node.id, "svc-42");
        assert_eq!(node.node_type, NodeType::Service);
        assert_eq!(node.status, Status::Healthy);
        assert_eq!(node.community, Some(7));
    }

    #[test]
    fn deserialize_edge_data() {
        let json = r#"{
            "id": "e-91",
            "source": "svc-42",
            "target": "db-12",
            "type": "DEPENDS_ON",
            "weight": 0.85
        }"#;
        let edge: EdgeData = serde_json::from_str(json).unwrap();
        assert_eq!(edge.edge_type, EdgeType::DependsOn);
        assert_eq!(edge.weight, 0.85);
    }
}
