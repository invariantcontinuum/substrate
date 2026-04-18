pub struct SearchIndex {
    entries: Vec<(String, String)>, // (lowercase_name, node_id)
}

impl SearchIndex {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
        }
    }
    pub fn insert(&mut self, id: &str, name: &str) {
        self.entries.push((name.to_lowercase(), id.to_string()));
    }
    pub fn remove(&mut self, id: &str) {
        self.entries.retain(|(_, eid)| eid != id);
    }
    pub fn search(&self, prefix: &str, limit: usize) -> Vec<String> {
        let p = prefix.to_lowercase();
        self.entries
            .iter()
            .filter(|(name, _)| name.starts_with(&p))
            .take(limit)
            .map(|(_, id)| id.clone())
            .collect()
    }
    pub fn clear(&mut self) {
        self.entries.clear();
    }
}

impl Default for SearchIndex {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefix_search() {
        let mut idx = SearchIndex::new();
        idx.insert("svc-1", "PaymentService");
        idx.insert("svc-2", "PayrollService");
        idx.insert("db-1", "PostgresDB");
        let result = idx.search("pay", 10);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn search_case_insensitive() {
        let mut idx = SearchIndex::new();
        idx.insert("svc-1", "PaymentService");
        assert_eq!(idx.search("PAYMENT", 10), vec!["svc-1"]);
    }

    #[test]
    fn search_limit() {
        let mut idx = SearchIndex::new();
        for i in 0..100 {
            idx.insert(&format!("n-{i}"), &format!("Node{i}"));
        }
        assert_eq!(idx.search("node", 5).len(), 5);
    }
}
