-- Orden manual de los items (drag and drop). Indexación fraccional: el cliente coloca un item
-- entre dos vecinos con la media de sus posiciones. Escala = milisegundos, igual que los items nuevos.
ALTER TABLE items ADD COLUMN position double precision;
UPDATE items SET position = updated_at;
ALTER TABLE items ALTER COLUMN position SET NOT NULL;
