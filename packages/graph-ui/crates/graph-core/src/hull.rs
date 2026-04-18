use std::collections::HashMap;

/// Compute convex hull of 2D points using Graham scan.
/// Returns indices of hull vertices in counter-clockwise order.
pub fn convex_hull(points: &[(f32, f32)]) -> Vec<usize> {
    let n = points.len();
    if n < 3 {
        return (0..n).collect();
    }

    // Find lowest-rightmost point as pivot
    let mut pivot = 0;
    for i in 1..n {
        if points[i].1 < points[pivot].1
            || (points[i].1 == points[pivot].1 && points[i].0 > points[pivot].0)
        {
            pivot = i;
        }
    }

    let mut indices: Vec<usize> = (0..n).collect();
    indices.swap(0, pivot);
    let p0 = points[indices[0]];
    indices[1..].sort_by(|&a, &b| {
        let va = (points[a].0 - p0.0, points[a].1 - p0.1);
        let vb = (points[b].0 - p0.0, points[b].1 - p0.1);
        let cross = va.0 * vb.1 - va.1 * vb.0;
        if cross.abs() < 1e-10 {
            let da = va.0 * va.0 + va.1 * va.1;
            let db = vb.0 * vb.0 + vb.1 * vb.1;
            da.partial_cmp(&db).unwrap()
        } else {
            cross.partial_cmp(&0.0).unwrap().reverse()
        }
    });

    let mut stack: Vec<usize> = Vec::new();
    for &idx in &indices {
        while stack.len() > 1 {
            let a = stack[stack.len() - 2];
            let b = stack[stack.len() - 1];
            let cross = cross_product(points[a], points[b], points[idx]);
            if cross <= 0.0 {
                stack.pop();
            } else {
                break;
            }
        }
        stack.push(idx);
    }
    stack
}

fn cross_product(o: (f32, f32), a: (f32, f32), b: (f32, f32)) -> f32 {
    (a.0 - o.0) * (b.1 - o.1) - (a.1 - o.1) * (b.0 - o.0)
}

/// Group nodes by community and compute hull for each.
pub fn compute_community_hulls(
    positions: &HashMap<String, (f32, f32)>,
    communities: &HashMap<String, u32>,
) -> HashMap<u32, Vec<(f32, f32)>> {
    let mut groups: HashMap<u32, Vec<(f32, f32)>> = HashMap::new();
    for (id, &community) in communities {
        if let Some(&pos) = positions.get(id) {
            groups.entry(community).or_default().push(pos);
        }
    }
    let mut hulls = HashMap::new();
    for (community, points) in groups {
        if points.len() < 3 {
            hulls.insert(community, points);
            continue;
        }
        let hull_indices = convex_hull(&points);
        let hull_points: Vec<(f32, f32)> = hull_indices.iter().map(|&i| points[i]).collect();
        hulls.insert(community, hull_points);
    }
    hulls
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn square_hull() {
        let points = vec![(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)];
        let hull = convex_hull(&points);
        assert_eq!(hull.len(), 4);
    }

    #[test]
    fn interior_point_excluded() {
        let points = vec![(0.0, 0.0), (2.0, 0.0), (2.0, 2.0), (0.0, 2.0), (1.0, 1.0)];
        let hull = convex_hull(&points);
        assert_eq!(hull.len(), 4);
        assert!(!hull.contains(&4));
    }

    #[test]
    fn two_points() {
        let hull = convex_hull(&[(0.0, 0.0), (1.0, 1.0)]);
        assert_eq!(hull.len(), 2);
    }

    #[test]
    fn community_hulls() {
        let mut positions = HashMap::new();
        let mut communities = HashMap::new();
        for i in 0..5 {
            let id = format!("n{i}");
            positions.insert(id.clone(), (i as f32, 0.0));
            communities.insert(id, 0);
        }
        for i in 5..10 {
            let id = format!("n{i}");
            positions.insert(id.clone(), (i as f32, 10.0));
            communities.insert(id, 1);
        }
        let hulls = compute_community_hulls(&positions, &communities);
        assert_eq!(hulls.len(), 2);
    }
}
