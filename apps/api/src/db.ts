import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

// bigint -> number (nuestros valores caben de sobra en 2^53)
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://coperoco:cambia-esto@localhost:5432/coperoco",
});

/** Espera a que Postgres acepte conexiones (arranque en frío del contenedor). */
export async function waitForDb(attempts = 30, delayMs = 1000) {
  for (let i = 1; ; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (e) {
      if (i >= attempts) throw e;
      console.log(`esperando a la base de datos (${i}/${attempts})…`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export async function migrate() {
  await waitForDb();
  await pool.query("CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY)");
  const dir = fileURLToPath(new URL("../sql/", import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const done = await client.query("SELECT 1 FROM _migrations WHERE name = $1", [file]);
      if (done.rowCount === 0) {
        await client.query(await readFile(dir + file, "utf8"));
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
        console.log(`migración aplicada: ${file}`);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
