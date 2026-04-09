ALTER TABLE sync_schedules RENAME TO job_schedules;
ALTER TABLE job_schedules ADD COLUMN job_type TEXT NOT NULL DEFAULT 'sync';
ALTER TABLE job_schedules ADD COLUMN scope JSONB NOT NULL DEFAULT '{}';

CREATE TABLE job_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,
    scope JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    progress_done INTEGER DEFAULT 0,
    progress_total INTEGER DEFAULT 0,
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_runs_status ON job_runs(status) WHERE status IN ('pending', 'running');
