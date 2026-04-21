use js_sys::{Float32Array, Uint8Array};
use std::cell::RefCell;
use wasm_bindgen::prelude::*;
use web_sys::DedicatedWorkerGlobalScope;

pub mod engine;
pub mod protocol;
pub mod websocket;

use engine::WorkerEngine;
use protocol::{EdgeIn, InMessage, NodeIn, OutMessage};

thread_local! {
    static ENGINE: RefCell<WorkerEngine> = RefCell::new(WorkerEngine::new());
}

#[wasm_bindgen(start)]
pub fn init() {
    console_log::init_with_level(log::Level::Info).ok();
}

/// Called from JS worker bootstrap on each `onmessage`.
#[wasm_bindgen]
pub fn handle_message(msg_js: &JsValue) -> Result<(), JsValue> {
    let msg: InMessage = serde_wasm_bindgen::from_value(msg_js.clone())
        .map_err(|e| JsValue::from_str(&format!("Deserialize error: {e}")))?;

    ENGINE.with(|cell| {
        let mut engine = cell.borrow_mut();
        match msg {
            InMessage::LoadSnapshot { nodes, edges } => {
                let core_nodes = nodes.into_iter().map(convert_node).collect();
                let core_edges = edges.into_iter().map(convert_edge).collect();
                engine.load_snapshot(core_nodes, core_edges);

                let (nc, ec, _vc) = engine.get_stats();
                post_json(&OutMessage::SnapshotLoaded {
                    node_count: nc,
                    edge_count: ec,
                    node_types: vec![],
                    domains: vec![],
                });
                post_positions(&engine);
                post_edges(&engine);
            }
            InMessage::SetLayout { layout } => {
                engine.set_layout(&layout);
                post_positions(&engine);
                post_edges(&engine);
                if !engine.is_layout_running() {
                    post_json(&OutMessage::Converged {});
                }
            }
            InMessage::SetFilter { filter } => {
                engine.set_filter(filter);
                post_positions(&engine);
            }
            InMessage::ConnectWs { url, token: _ } => {
                log::info!("WS connect requested: {}", url);
            }
            InMessage::SetSpotlight { ids } => {
                engine.set_spotlight(ids);
                post_positions(&engine);
            }
            InMessage::SetCommunities { show } => {
                engine.set_communities(show);
            }
            InMessage::ClearSnapshot {} => {
                engine.clear_snapshot();
                post_positions(&engine);
                post_edges(&engine);
            }
            InMessage::PinNode { idx, x, y } => {
                engine.pin_node(idx, x, y);
                post_positions(&engine);
                post_edges(&engine);
            }
            InMessage::UnpinNode { idx } => {
                engine.unpin_node(idx);
                post_positions(&engine);
                post_edges(&engine);
            }
            InMessage::SetViewport { ratio } => {
                engine.set_viewport_ratio(ratio);
                post_positions(&engine);
                post_edges(&engine);
                if !engine.is_layout_running() {
                    post_json(&OutMessage::Converged {});
                }
            }
        }
    });

    Ok(())
}

/// Called from JS on each animation frame tick.
/// Returns true if layout is still moving.
#[wasm_bindgen]
pub fn tick() -> bool {
    ENGINE.with(|cell| {
        let mut engine = cell.borrow_mut();
        let still_moving = engine.tick();

        if still_moving || engine.is_layout_running() {
            post_positions(&engine);
            post_edges(&engine);
        }

        if !still_moving && !engine.is_layout_running() {
            post_json(&OutMessage::Converged {});
        }

        still_moving
    })
}

fn post_positions(engine: &WorkerEngine) {
    let scope: DedicatedWorkerGlobalScope = js_sys::global().unchecked_into();

    let pos_data = engine.get_position_buffer();
    let visible_ids = engine.visible_node_ids();
    let pos_array = Float32Array::new_with_length(pos_data.len() as u32);
    pos_array.copy_from(&pos_data);

    let flags = engine.get_visual_flags();
    let flags_array = Uint8Array::new_with_length(flags.len() as u32);
    flags_array.copy_from(flags);

    let msg = js_sys::Object::new();
    js_sys::Reflect::set(&msg, &"type".into(), &"positions".into()).ok();
    js_sys::Reflect::set(&msg, &"positions".into(), &pos_array).ok();
    js_sys::Reflect::set(&msg, &"flags".into(), &flags_array).ok();
    if let Ok(ids_js) = serde_wasm_bindgen::to_value(&visible_ids) {
        js_sys::Reflect::set(&msg, &"node_ids".into(), &ids_js).ok();
    }
    js_sys::Reflect::set(
        &msg,
        &"visible_count".into(),
        &JsValue::from_f64(pos_data.len() as f64 / 4.0),
    )
    .ok();

    let transfer = js_sys::Array::new();
    transfer.push(&pos_array.buffer());
    transfer.push(&flags_array.buffer());

    scope.post_message_with_transfer(&msg, &transfer).ok();
}

fn post_edges(engine: &WorkerEngine) {
    let scope: DedicatedWorkerGlobalScope = js_sys::global().unchecked_into();

    let edge_data = engine.get_edge_buffer();
    let edge_count = edge_data.len() / 6; // 6 floats per edge
    let edge_array = Float32Array::new_with_length(edge_data.len() as u32);
    edge_array.copy_from(&edge_data);

    let msg = js_sys::Object::new();
    js_sys::Reflect::set(&msg, &"type".into(), &"edges".into()).ok();
    js_sys::Reflect::set(&msg, &"edges".into(), &edge_array).ok();
    js_sys::Reflect::set(
        &msg,
        &"edge_count".into(),
        &JsValue::from_f64(edge_count as f64),
    )
    .ok();

    let transfer = js_sys::Array::new();
    transfer.push(&edge_array.buffer());
    scope.post_message_with_transfer(&msg, &transfer).ok();
}

fn post_json(msg: &OutMessage) {
    let scope: DedicatedWorkerGlobalScope = js_sys::global().unchecked_into();
    if let Ok(val) = serde_wasm_bindgen::to_value(msg) {
        scope.post_message(&val).ok();
    }
}

fn convert_node(n: NodeIn) -> graph_core::types::NodeData {
    graph_core::types::NodeData {
        id: n.id,
        name: n.name,
        node_type: parse_node_type(&n.node_type),
        domain: n.domain,
        status: parse_status(&n.status),
        community: n.community,
        meta: match n.meta {
            serde_json::Value::Object(m) => m.into_iter().collect(),
            _ => std::collections::HashMap::new(),
        },
    }
}

fn convert_edge(e: EdgeIn) -> graph_core::types::EdgeData {
    graph_core::types::EdgeData {
        id: e.id,
        source: e.source,
        target: e.target,
        edge_type: parse_edge_type(&e.edge_type),
        label: e.label,
        weight: e.weight,
    }
}

fn parse_node_type(s: &str) -> graph_core::types::NodeType {
    match s {
        "service" => graph_core::types::NodeType::Service,
        "database" => graph_core::types::NodeType::Database,
        "cache" => graph_core::types::NodeType::Cache,
        "external" => graph_core::types::NodeType::External,
        "policy" => graph_core::types::NodeType::Policy,
        "adr" => graph_core::types::NodeType::Adr,
        "incident" => graph_core::types::NodeType::Incident,
        _ => graph_core::types::NodeType::Service,
    }
}

fn parse_status(s: &str) -> graph_core::types::Status {
    match s {
        "healthy" => graph_core::types::Status::Healthy,
        "violation" => graph_core::types::Status::Violation,
        "warning" => graph_core::types::Status::Warning,
        "enforced" => graph_core::types::Status::Enforced,
        _ => graph_core::types::Status::Healthy,
    }
}

fn parse_edge_type(s: &str) -> graph_core::types::EdgeType {
    match s {
        "depends_on" => graph_core::types::EdgeType::DependsOn,
        "calls" => graph_core::types::EdgeType::Calls,
        "violation" => graph_core::types::EdgeType::Violation,
        "enforces" => graph_core::types::EdgeType::Enforces,
        "drift" => graph_core::types::EdgeType::Drift,
        _ => graph_core::types::EdgeType::DependsOn,
    }
}
