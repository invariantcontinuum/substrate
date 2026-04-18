pub mod force;
pub mod hierarchical;
pub mod incremental;

pub use force::ForceLayout;
pub use hierarchical::HierarchicalLayout;

pub trait LayoutEngine {
    fn compute(&mut self, graph: &graph_core::graph::GraphStore) -> Vec<(String, f32, f32)>;
    fn tick(&mut self, graph: &graph_core::graph::GraphStore) -> bool;
    fn is_converged(&self) -> bool;
}
