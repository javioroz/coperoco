ALTER TABLE memberships ADD COLUMN joined_at timestamptz NOT NULL DEFAULT now();
