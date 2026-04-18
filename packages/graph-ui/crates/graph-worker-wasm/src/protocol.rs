use serde::{Deserialize, Serialize};

/// Messages from main thread to worker
#[derive(Deserialize)]
#[serde(tag = "type")]
pub enum InMessage {
    #[serde(rename = "load_snapshot")]
    LoadSnapshot {
        nodes: Vec<NodeIn>,
        edges: Vec<EdgeIn>,
    },
    #[serde(rename = "clear_snapshot")]
    ClearSnapshot {},
    #[serde(rename = "set_layout")]
    SetLayout { layout: String },
    #[serde(rename = "set_filter")]
    SetFilter { filter: Option<FilterIn> },
    #[serde(rename = "connect_ws")]
    ConnectWs { url: String, token: String },
    #[serde(rename = "set_spotlight")]
    SetSpotlight { ids: Option<Vec<String>> },
    #[serde(rename = "set_communities")]
    SetCommunities { show: bool },
    #[serde(rename = "pin_node")]
    PinNode { idx: usize, x: f32, y: f32 },
    #[serde(rename = "unpin_node")]
    UnpinNode { idx: usize },
}

#[derive(Deserialize)]
pub struct NodeIn {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub domain: String,
    pub status: String,
    pub community: Option<u32>,
    #[serde(default)]
    pub meta: serde_json::Value,
}

#[derive(Deserialize)]
pub struct EdgeIn {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(rename = "type")]
    pub edge_type: String,
    pub label: String,
    pub weight: f32,
}

#[derive(Deserialize)]
pub struct FilterIn {
    pub types: Option<Vec<String>>,
    pub domains: Option<Vec<String>>,
    pub status: Option<Vec<String>>,
}

/// Messages from worker to main thread
#[derive(Serialize)]
#[serde(tag = "type")]
pub enum OutMessage {
    #[serde(rename = "snapshot_loaded")]
    SnapshotLoaded {
        node_count: usize,
        edge_count: usize,
        node_types: Vec<String>,
        domains: Vec<String>,
    },
    #[serde(rename = "stats")]
    Stats {
        node_count: usize,
        edge_count: usize,
        violation_count: usize,
        last_updated: String,
    },
    #[serde(rename = "converged")]
    Converged {},
    #[serde(rename = "ws_nodes_added")]
    WsNodesAdded { count: usize },
    #[serde(rename = "ws_status")]
    WsStatus { status: String },
}
