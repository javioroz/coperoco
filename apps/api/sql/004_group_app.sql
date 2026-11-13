-- Cada grupo pertenece a una aplicación de la plataforma (cestaco, gastoco, favorco, viajeco).
-- Los grupos existentes son todos de CestaCo.
ALTER TABLE groups ADD COLUMN app text NOT NULL DEFAULT 'cestaco';
CREATE INDEX ON groups (app);
