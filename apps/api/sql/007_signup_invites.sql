-- Registro solo con invitación. Una invitación de plataforma la crea un usuario existente
-- (created_by) o el servidor por línea de comandos (created_by NULL, para el primer usuario).
CREATE TABLE signup_invites (
  code       text PRIMARY KEY,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  used_at    timestamptz               -- "usada" = used_at IS NOT NULL (sigue valiendo si se borra el usuario)
);
CREATE INDEX ON signup_invites (created_by);

-- Quién invitó a cada usuario (trazabilidad si hay abuso)
ALTER TABLE users ADD COLUMN invited_by uuid REFERENCES users(id) ON DELETE SET NULL;
