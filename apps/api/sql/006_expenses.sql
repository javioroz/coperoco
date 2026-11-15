-- GastoCo: gastos compartidos de un grupo.
CREATE SEQUENCE expenses_seq;

CREATE TABLE expenses (
  id           uuid PRIMARY KEY,
  group_id     uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  description  text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  paid_by      uuid NOT NULL,   -- id de usuario (puede ser un ex-miembro: su saldo sigue contando)
  shared_by    uuid[] NOT NULL CHECK (cardinality(shared_by) > 0),
  category     text NOT NULL DEFAULT '',
  date         text NOT NULL,   -- YYYY-MM-DD
  created_at   bigint NOT NULL,
  deleted      boolean NOT NULL DEFAULT false,
  updated_at   bigint NOT NULL, -- reloj del cliente (LWW)
  seq          bigint NOT NULL DEFAULT nextval('expenses_seq')
);
CREATE INDEX ON expenses (group_id, seq);
