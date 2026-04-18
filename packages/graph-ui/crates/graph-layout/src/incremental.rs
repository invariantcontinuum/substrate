use std::collections::HashMap;

pub fn place_added_nodes(
    existing_positions: &HashMap<String, (f32, f32)>,
    added_ids: &[String],
    neighbor_map: &HashMap<String, Vec<String>>,
) -> Vec<(String, f32, f32)> {
    let mut result = Vec::new();
    for id in added_ids {
        if let Some(neighbors) = neighbor_map.get(id) {
            let mut sx = 0.0f32;
            let mut sy = 0.0f32;
            let mut c = 0u32;
            for nid in neighbors {
                if let Some(&(x, y)) = existing_positions.get(nid) {
                    sx += x;
                    sy += y;
                    c += 1;
                }
            }
            if c > 0 {
                let jitter = (id.len() as f32 * 7.3).sin() * 20.0;
                result.push((id.clone(), sx / c as f32 + jitter, sy / c as f32 + jitter));
            } else {
                result.push((id.clone(), 0.0, 0.0));
            }
        } else {
            result.push((id.clone(), 0.0, 0.0));
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn places_near_neighbors() {
        let mut existing = HashMap::new();
        existing.insert("a".into(), (100.0, 200.0));
        existing.insert("b".into(), (300.0, 200.0));
        let mut neighbors = HashMap::new();
        neighbors.insert("c".into(), vec!["a".into(), "b".into()]);
        let result = place_added_nodes(&existing, &["c".into()], &neighbors);
        assert_eq!(result.len(), 1);
        let (_, x, y) = &result[0];
        assert!((x - 200.0).abs() < 50.0);
        assert!((y - 200.0).abs() < 50.0);
    }
}
