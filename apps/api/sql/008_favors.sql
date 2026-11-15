-- FavorCo: favores de un grupo y configuración de IA por grupo.
CREATE SEQUENCE favors_seq;

CREATE TABLE favors (
  id          uuid PRIMARY KEY,
  group_id    uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  description text NOT NULL,
  made_by     uuid NOT NULL,                       -- quien hizo el favor (recibe los puntos)
  affected    uuid[] NOT NULL DEFAULT '{}',        -- a quién afecta / beneficia
  date        text NOT NULL,                       -- YYYY-MM-DD
  score       integer NOT NULL CHECK (score BETWEEN -10 AND 10),
  ai          boolean NOT NULL DEFAULT false,      -- puntuado por la IA
  ai_comment  text NOT NULL DEFAULT '',
  nickname    text NOT NULL DEFAULT '',
  created_at  bigint NOT NULL,
  deleted     boolean NOT NULL DEFAULT false,
  updated_at  bigint NOT NULL,                     -- reloj del cliente (LWW)
  seq         bigint NOT NULL DEFAULT nextval('favors_seq')
);
CREATE INDEX ON favors (group_id, seq);

-- Configuración del LLM por grupo. La clave se guarda CIFRADA (AES-256-GCM, clave SECRETS_KEY del servidor)
-- y nunca se envía a ningún cliente: las llamadas al LLM las hace el servidor.
CREATE TABLE group_llm (
  group_id    uuid PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  model       text NOT NULL,
  api_key_enc text NOT NULL,
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
