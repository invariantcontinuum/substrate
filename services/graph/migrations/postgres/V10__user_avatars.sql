-- V10: user avatars stored inline as PNG bytes on user_profiles.
--
-- The gateway's POST /api/users/me/avatar endpoint accepts an upload,
-- centre-crops + resizes to a square via Pillow, and writes the PNG
-- bytes to ``avatar_image`` along with the canonical ``avatar_mime``
-- and an ``avatar_updated_at`` cache-busting timestamp.
--
-- Inline BYTEA was chosen over an external object store on purpose:
-- a 256x256 PNG is ~30-60 KiB, which is small enough to live alongside
-- the rest of the profile row without bloating routine SELECTs (the
-- column is excluded from default queries — readers must explicitly
-- name it).

ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS avatar_image      BYTEA,
    ADD COLUMN IF NOT EXISTS avatar_mime       TEXT,
    ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;
