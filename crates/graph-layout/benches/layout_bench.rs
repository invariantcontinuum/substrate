use criterion::{criterion_group, criterion_main};

fn layout_benchmarks(_c: &mut criterion::Criterion) {
    // TODO: Add layout benchmarks
}

criterion_group!(benches, layout_benchmarks);
criterion_main!(benches);
