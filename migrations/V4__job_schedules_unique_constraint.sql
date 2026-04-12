-- The scheduler upsert in src/scheduler.py uses ON CONFLICT (job_type, owner, repo)
-- but V2 only created a UNIQUE (owner, repo) constraint under the old name
-- sync_schedules_owner_repo_key. Drop it and recreate with the correct columns.
ALTER TABLE job_schedules DROP CONSTRAINT IF EXISTS sync_schedules_owner_repo_key;
ALTER TABLE job_schedules ADD CONSTRAINT job_schedules_job_type_owner_repo_key UNIQUE (job_type, owner, repo);
