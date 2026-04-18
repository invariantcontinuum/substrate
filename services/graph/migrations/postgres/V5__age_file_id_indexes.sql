-- V5: expression indexes on AGE File vertex properties.
--
-- Without these, every `MATCH (a:File {file_id: '...'})` in
-- enriched_summary._fetch_edge_neighbors (and snapshot_query.*) does a
-- full scan of ~190k vertices, taking minutes and pinning pool
-- connections. With the btree expression index on
-- `properties -> '"file_id"'::agtype`, lookups are logarithmic.
-- A second index on sync_id keeps neighbour-fan queries cheap when
-- they filter by sync too.
--
-- Flyway runs these at startup; LOAD 'age' is idempotent.

LOAD 'age';
SET LOCAL search_path = ag_catalog, public;

CREATE INDEX IF NOT EXISTS ix_substrate_file_fileid
  ON substrate."File" USING btree ((properties -> '"file_id"'::agtype));

CREATE INDEX IF NOT EXISTS ix_substrate_file_syncid
  ON substrate."File" USING btree ((properties -> '"sync_id"'::agtype));

ANALYZE substrate."File";
