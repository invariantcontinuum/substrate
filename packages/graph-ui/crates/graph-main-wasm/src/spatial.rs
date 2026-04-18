/// Flat grid spatial index for O(1) node picking.
pub struct SpatialGrid {
    cells: Vec<Vec<usize>>,
    cols: usize,
    rows: usize,
    x_min: f32,
    y_min: f32,
    cell_w: f32,
    cell_h: f32,
}

impl Default for SpatialGrid {
    fn default() -> Self {
        Self::new()
    }
}

impl SpatialGrid {
    pub fn new() -> Self {
        Self {
            cells: Vec::new(),
            cols: 0,
            rows: 0,
            x_min: 0.0,
            y_min: 0.0,
            cell_w: 1.0,
            cell_h: 1.0,
        }
    }

    /// Rebuild the grid from position data.
    /// `positions` is [x0, y0, r0, type0, x1, y1, r1, type1, ...] (4 floats per node).
    pub fn rebuild(&mut self, positions: &[f32], grid_size: usize) {
        let node_count = positions.len() / 4;
        if node_count == 0 {
            self.cells.clear();
            self.cols = 0;
            self.rows = 0;
            return;
        }

        let mut x_min = f32::MAX;
        let mut x_max = f32::MIN;
        let mut y_min = f32::MAX;
        let mut y_max = f32::MIN;

        for i in 0..node_count {
            let x = positions[i * 4];
            let y = positions[i * 4 + 1];
            x_min = x_min.min(x);
            x_max = x_max.max(x);
            y_min = y_min.min(y);
            y_max = y_max.max(y);
        }

        let pad = 10.0;
        x_min -= pad;
        x_max += pad;
        y_min -= pad;
        y_max += pad;

        self.cols = grid_size;
        self.rows = grid_size;
        self.x_min = x_min;
        self.y_min = y_min;
        self.cell_w = (x_max - x_min) / grid_size as f32;
        self.cell_h = (y_max - y_min) / grid_size as f32;

        let total = self.cols * self.rows;
        self.cells.clear();
        self.cells.resize(total, Vec::new());

        for i in 0..node_count {
            let x = positions[i * 4];
            let y = positions[i * 4 + 1];
            let col = ((x - self.x_min) / self.cell_w).floor() as usize;
            let row = ((y - self.y_min) / self.cell_h).floor() as usize;
            let col = col.min(self.cols - 1);
            let row = row.min(self.rows - 1);
            self.cells[row * self.cols + col].push(i);
        }
    }

    /// Return all node indices whose cells fall within `radius` world-units of the query point.
    /// This is a coarse first pass — callers must do a fine-grained check (e.g. AABB or SDF).
    pub fn candidates_within(&self, world_x: f32, world_y: f32, radius: f32) -> Vec<usize> {
        let mut out = Vec::new();
        if self.cell_w == 0.0 || self.cell_h == 0.0 {
            return out;
        }
        let cell_radius = ((radius / self.cell_w.min(self.cell_h)).ceil() as isize).max(1);
        let col = ((world_x - self.x_min) / self.cell_w).floor() as isize;
        let row = ((world_y - self.y_min) / self.cell_h).floor() as isize;
        for dr in -cell_radius..=cell_radius {
            for dc in -cell_radius..=cell_radius {
                let r = row + dr;
                let c = col + dc;
                if r < 0 || r >= self.rows as isize || c < 0 || c >= self.cols as isize {
                    continue;
                }
                let cell = &self.cells[(r as usize) * self.cols + c as usize];
                out.extend(cell.iter().copied());
            }
        }
        out
    }

    /// Find the node index closest to (world_x, world_y) within max_distance.
    pub fn pick(
        &self,
        world_x: f32,
        world_y: f32,
        positions: &[f32],
        max_distance: f32,
    ) -> Option<usize> {
        if self.cols == 0 || self.rows == 0 {
            return None;
        }

        let col = ((world_x - self.x_min) / self.cell_w).floor() as isize;
        let row = ((world_y - self.y_min) / self.cell_h).floor() as isize;

        // Expand search radius to cover max_distance in cell units (min 1).
        let cell_radius = ((max_distance / self.cell_w.min(self.cell_h)).ceil() as isize).max(1);

        let mut best: Option<(usize, f32)> = None;

        for dr in -cell_radius..=cell_radius {
            for dc in -cell_radius..=cell_radius {
                let r = row + dr;
                let c = col + dc;
                if r < 0 || r >= self.rows as isize || c < 0 || c >= self.cols as isize {
                    continue;
                }
                let cell_idx = r as usize * self.cols + c as usize;
                for &node_idx in &self.cells[cell_idx] {
                    let nx = positions[node_idx * 4];
                    let ny = positions[node_idx * 4 + 1];
                    let nr = positions[node_idx * 4 + 2];
                    let dx = world_x - nx;
                    let dy = world_y - ny;
                    let dist = (dx * dx + dy * dy).sqrt();
                    let hit_dist = dist - nr;
                    if hit_dist < max_distance && (best.is_none() || dist < best.unwrap().1) {
                        best = Some((node_idx, dist));
                    }
                }
            }
        }

        best.map(|(idx, _)| idx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_finds_nearest_node() {
        let mut grid = SpatialGrid::new();
        let positions = vec![
            0.0, 0.0, 10.0, 0.0, 100.0, 100.0, 10.0, 0.0, 50.0, 50.0, 10.0, 0.0,
        ];
        grid.rebuild(&positions, 10);

        let result = grid.pick(52.0, 48.0, &positions, 20.0);
        assert_eq!(result, Some(2));

        let result = grid.pick(3.0, 3.0, &positions, 20.0);
        assert_eq!(result, Some(0));

        let result = grid.pick(-500.0, -500.0, &positions, 20.0);
        assert_eq!(result, None);
    }

    #[test]
    fn empty_grid_returns_none() {
        let mut grid = SpatialGrid::new();
        grid.rebuild(&[], 10);
        assert_eq!(grid.pick(0.0, 0.0, &[], 20.0), None);
    }

    #[test]
    fn rebuild_handles_single_node() {
        let mut grid = SpatialGrid::new();
        let positions = vec![0.0, 0.0, 10.0, 0.0];
        grid.rebuild(&positions, 10);
        let result = grid.pick(5.0, 5.0, &positions, 20.0);
        assert_eq!(result, Some(0));
    }
}
