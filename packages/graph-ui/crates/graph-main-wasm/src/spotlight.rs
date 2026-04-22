//! Spotlight subsystem: compute focused-node neighborhood, stamp dim bits,
//! hand focused indices to the renderer. Separated from engine.rs so we can
//! unit-test the lookup + neighborhood computation in isolation.

use std::collections::{HashMap, HashSet};

/// Coordinate-bit keyed lookup from (x, y) pair to node index.
/// Uses raw f32 bits — positions round-trip byte-identical across the
/// worker boundary (Float32Array preserves bits), so collisions happen
/// only on genuine f32 overlap, not sub-pixel rounding.
pub fn build_coord_index(positions: &[f32]) -> HashMap<(u32, u32), usize> {
    let node_count = positions.len() / 4;
    let mut map = HashMap::with_capacity(node_count);
    for i in 0..node_count {
        let x = positions[i * 4].to_bits();
        let y = positions[i * 4 + 1].to_bits();
        map.insert((x, y), i);
    }
    map
}

/// Given a focused node index + the edge buffer in stride-6
/// [sx, sy, tx, ty, type_idx, weight] world-coord layout, return the set of
/// node indices in the 1-hop closed neighborhood (focus + neighbors).
pub fn neighborhood_indices(
    focus_idx: usize,
    edge_data: &[f32],
    coord_to_idx: &HashMap<(u32, u32), usize>,
) -> HashSet<usize> {
    let mut keep = HashSet::new();
    keep.insert(focus_idx);
    for chunk in edge_data.chunks_exact(6) {
        let sx = chunk[0].to_bits();
        let sy = chunk[1].to_bits();
        let tx = chunk[2].to_bits();
        let ty = chunk[3].to_bits();
        let s = coord_to_idx.get(&(sx, sy)).copied();
        let t = coord_to_idx.get(&(tx, ty)).copied();
        if s == Some(focus_idx) {
            if let Some(ti) = t { keep.insert(ti); }
        }
        if t == Some(focus_idx) {
            if let Some(si) = s { keep.insert(si); }
        }
    }
    keep
}

/// Stamp the dim bit (bit 0) on `visual_flags`: clear for members of `keep`,
/// set for everyone else. `visual_flags` is grown to `node_count` if short.
pub fn apply_dim_bits(visual_flags: &mut Vec<u8>, node_count: usize, keep: &HashSet<usize>) {
    if visual_flags.len() < node_count {
        visual_flags.resize(node_count, 0);
    }
    for (i, f) in visual_flags.iter_mut().enumerate() {
        if keep.contains(&i) {
            *f &= !1;
        } else {
            *f |= 1;
        }
    }
}

/// Clear the dim bit on every flag (exits spotlight mode).
pub fn clear_dim_bits(visual_flags: &mut [u8]) {
    for f in visual_flags.iter_mut() {
        *f &= !1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk_positions(coords: &[(f32, f32)]) -> Vec<f32> {
        let mut v = Vec::with_capacity(coords.len() * 4);
        for &(x, y) in coords {
            v.extend_from_slice(&[x, y, 30.0, 0.0]);
        }
        v
    }

    #[test]
    fn coord_index_is_unique_per_node() {
        let pos = mk_positions(&[(0.0, 0.0), (1.0, 0.0), (0.0, 1.0)]);
        let idx = build_coord_index(&pos);
        assert_eq!(idx.len(), 3);
    }

    #[test]
    fn neighborhood_includes_focus_and_1_hop() {
        let pos = mk_positions(&[(0.0, 0.0), (10.0, 0.0), (20.0, 0.0), (30.0, 0.0)]);
        let idx = build_coord_index(&pos);
        let edges = vec![
            0.0, 0.0, 10.0, 0.0, 0.0, 1.0,
            10.0, 0.0, 20.0, 0.0, 0.0, 1.0,
            20.0, 0.0, 30.0, 0.0, 0.0, 1.0,
        ];
        let n = neighborhood_indices(1, &edges, &idx);
        assert_eq!(n.len(), 3);
        assert!(n.contains(&0));
        assert!(n.contains(&1));
        assert!(n.contains(&2));
        assert!(!n.contains(&3));
    }

    #[test]
    fn dim_then_clear_round_trip() {
        let mut flags = vec![0u8; 4];
        let mut keep = HashSet::new();
        keep.insert(1);
        apply_dim_bits(&mut flags, 4, &keep);
        assert_eq!(flags, vec![1, 0, 1, 1]);
        clear_dim_bits(&mut flags);
        assert_eq!(flags, vec![0, 0, 0, 0]);
    }
}
