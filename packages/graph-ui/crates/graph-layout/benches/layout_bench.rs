use criterion::{Criterion, criterion_group, criterion_main};
use graph_core::graph::GraphStore;
use graph_core::types::*;
use graph_layout::{ForceLayout, LayoutEngine};

fn make_graph(node_count: usize, edge_count: usize) -> GraphStore {
    let mut g = GraphStore::new();
    for i in 0..node_count {
        g.add_node(NodeData {
            id: format!("n{i}"),
            name: format!("Node{i}"),
            node_type: NodeType::Service,
            domain: "bench".into(),
            status: Status::Healthy,
            community: Some((i % 10) as u32),
            meta: Default::default(),
        });
    }
    for i in 0..edge_count {
        let src = i % node_count;
        let tgt = (i * 7 + 13) % node_count;
        if src != tgt {
            g.add_edge(EdgeData {
                id: format!("e{i}"),
                source: format!("n{src}"),
                target: format!("n{tgt}"),
                edge_type: EdgeType::DependsOn,
                label: String::new(),
                weight: 1.0,
            });
        }
    }
    g
}

fn bench_force_layout_1k(c: &mut Criterion) {
    let graph = make_graph(1000, 3000);
    c.bench_function("force_layout_1k_nodes", |b| {
        b.iter(|| {
            let mut l = ForceLayout::new();
            l.compute(&graph);
        })
    });
}

criterion_group!(benches, bench_force_layout_1k);
criterion_main!(benches);
