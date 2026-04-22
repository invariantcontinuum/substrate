//! Render-order contract: edge drawing MUST precede node drawing. Nothing
//! else enforces this — if someone reorders the calls, edges would visually
//! sit on top of nodes, breaking the "edges in background" feel.

use std::fs;

#[test]
fn edges_draw_before_nodes_draw() {
    let src = fs::read_to_string("src/engine.rs").expect("read source");
    let edge_pos = src
        .find("self.edge_renderer.draw")
        .expect("edge_renderer.draw call not found in src/engine.rs");
    let node_pos = src
        .find("self.node_renderer.draw")
        .expect("node_renderer.draw call not found in src/engine.rs");
    assert!(
        edge_pos < node_pos,
        "edges draw must come before nodes draw (edge_pos={edge_pos}, node_pos={node_pos})"
    );
}
