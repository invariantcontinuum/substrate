-- V2: Add enabled column to sources table.
-- Existing rows default to true (active).
ALTER TABLE sources ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
