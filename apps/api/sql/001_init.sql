CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE groups (
  id         uuid PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX ON memberships (user_id);

CREATE TABLE invites (
  code       text PRIMARY KEY,
  group_id   uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE SEQUENCE items_seq;

CREATE TABLE items (
  id         uuid PRIMARY KEY,
  group_id   uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name       text NOT NULL,
  quantity   text NOT NULL DEFAULT '',
  checked    boolean NOT NULL DEFAULT false,
  deleted    boolean NOT NULL DEFAULT false,
  updated_at bigint NOT NULL,                       -- reloj del cliente (LWW)
  seq        bigint NOT NULL DEFAULT nextval('items_seq') -- orden de cambios en servidor (cursor)
);
CREATE INDEX ON items (group_id, seq);
