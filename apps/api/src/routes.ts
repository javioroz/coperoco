import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createGroupSchema,
  updateGroupSchema,
  credentialsSchema,
  syncRequestSchema,
  type AuthResponse,
  type Item,
  type SyncResponse,
} from "@coperoco/shared";
import { bearer, createSession, destroySession, hashPassword, requireMember, requireUser, verifyPassword } from "./auth.js";
import { pool } from "./db.js";

const uuidParam = z.object({ id: z.string().uuid() });
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newInviteCode() {
  return Array.from(randomBytes(8), (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join("");
}

export async function routes(app: FastifyInstance) {
  // ---------- Auth ----------
  app.post("/auth/register", async (req, reply) => {
    const { username, password } = credentialsSchema.parse(req.body);
    const hash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $2)
       ON CONFLICT (username) DO NOTHING RETURNING id, username`,
      [username, hash],
    );
    if (!rows[0]) return reply.code(409).send({ error: "el usuario ya existe" });
    const res: AuthResponse = { token: await createSession(rows[0].id), user: rows[0] };
    return res;
  });

  app.post("/auth/login", async (req, reply) => {
    const { username, password } = credentialsSchema.parse(req.body);
    const { rows } = await pool.query("SELECT id, username, password_hash FROM users WHERE username = $1", [username]);
    const u = rows[0];
    if (!u || !(await verifyPassword(password, u.password_hash)))
      return reply.code(401).send({ error: "credenciales incorrectas" });
    const res: AuthResponse = { token: await createSession(u.id), user: { id: u.id, username: u.username } };
    return res;
  });

  app.post("/auth/logout", async (req) => {
    const t = bearer(req);
    if (t) await destroySession(t);
    return { ok: true };
  });

  app.register(async (priv) => {
    priv.addHook("preHandler", requireUser);

    priv.get("/me", async (req) => req.user);

    // ---------- Grupos ----------
    priv.get("/groups", async (req) => {
      const { rows } = await pool.query(
        `SELECT g.id, g.app, g.name, g.emoji FROM groups g JOIN memberships m ON m.group_id = g.id
         WHERE m.user_id = $1 ORDER BY g.created_at`,
        [req.user.id],
      );
      return rows;
    });

    priv.post("/groups", async (req, reply) => {
      const { id, app: groupApp, name, emoji } = createGroupSchema.parse(req.body);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const ins = await client.query("INSERT INTO groups (id, app, name, emoji) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [id, groupApp, name, emoji]);
        if (ins.rowCount === 0) {
          // reintento idempotente: solo ok si ya soy miembro
          const m = await client.query("SELECT 1 FROM memberships WHERE group_id=$1 AND user_id=$2", [id, req.user.id]);
          await client.query("ROLLBACK");
          if (!m.rowCount) return reply.code(409).send({ error: "id en uso" });
          return { id, app: groupApp, name, emoji };
        }
        await client.query("INSERT INTO memberships (group_id, user_id, role) VALUES ($1, $2, 'owner')", [id, req.user.id]);
        await client.query("COMMIT");
        return { id, app: groupApp, name, emoji };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    });

    priv.get("/groups/:id/members", async (req, reply) => {
      const { id } = uuidParam.parse(req.params);
      if (!(await requireMember(req, reply, id))) return;
      const { rows } = await pool.query(
        `SELECT u.id, u.username, m.role FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.group_id = $1 ORDER BY u.username`,
        [id],
      );
      return rows;
    });

    // Renombrar / cambiar emoji (cualquier miembro)
    priv.patch("/groups/:id", async (req, reply) => {
      const { id } = uuidParam.parse(req.params);
      const { name, emoji } = updateGroupSchema.parse(req.body);
      if (!(await requireMember(req, reply, id))) return;
      await pool.query("UPDATE groups SET name=$2, emoji=$3 WHERE id=$1", [id, name, emoji]);
      const { rows } = await pool.query("SELECT app FROM groups WHERE id=$1", [id]);
      return { id, app: rows[0].app, name, emoji };
    });

    // Expulsar a un miembro (solo el creador)
    priv.delete("/groups/:id/members/:userId", async (req, reply) => {
      const { id, userId } = z.object({ id: z.string().uuid(), userId: z.string().uuid() }).parse(req.params);
      if (!(await requireMember(req, reply, id))) return;
      const me = await pool.query("SELECT role FROM memberships WHERE group_id=$1 AND user_id=$2", [id, req.user.id]);
      if (me.rows[0]?.role !== "owner") return reply.code(403).send({ error: "solo el creador puede quitar miembros" });
      if (userId === req.user.id) return reply.code(400).send({ error: "usa 'salir de la cesta' para abandonarla" });
      const del = await pool.query("DELETE FROM memberships WHERE group_id=$1 AND user_id=$2", [id, userId]);
      if (!del.rowCount) return reply.code(404).send({ error: "miembro no encontrado" });
      return { ok: true };
    });

    priv.delete("/groups/:id/membership", async (req, reply) => {
      const { id } = uuidParam.parse(req.params);
      if (!(await requireMember(req, reply, id))) return;
      await pool.query("DELETE FROM memberships WHERE group_id=$1 AND user_id=$2", [id, req.user.id]);
      // si se fue el creador, el miembro más antiguo pasa a ser creador
      await pool.query(
        `UPDATE memberships SET role='owner'
         WHERE group_id=$1
           AND user_id = (SELECT user_id FROM memberships WHERE group_id=$1 ORDER BY joined_at, user_id LIMIT 1)
           AND NOT EXISTS (SELECT 1 FROM memberships WHERE group_id=$1 AND role='owner')`,
        [id],
      );
      // grupo huérfano -> se elimina
      await pool.query(
        "DELETE FROM groups g WHERE g.id=$1 AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.group_id=g.id)",
        [id],
      );
      return { ok: true };
    });

    // ---------- Invitaciones ----------
    priv.post("/groups/:id/invites", async (req, reply) => {
      const { id } = uuidParam.parse(req.params);
      if (!(await requireMember(req, reply, id))) return;
      const code = newInviteCode();
      const expiresAt = Date.now() + INVITE_TTL_MS;
      await pool.query("INSERT INTO invites (code, group_id, created_by, expires_at) VALUES ($1,$2,$3,to_timestamp($4/1000.0))", [
        code,
        id,
        req.user.id,
        expiresAt,
      ]);
      return { code, expiresAt };
    });

    priv.post("/invites/:code/join", async (req, reply) => {
      const { code } = z.object({ code: z.string().trim().toUpperCase().min(4).max(32) }).parse(req.params);
      const { rows } = await pool.query(
        `SELECT g.id, g.app, g.name, g.emoji FROM invites i JOIN groups g ON g.id = i.group_id
         WHERE i.code = $1 AND i.expires_at > now()`,
        [code],
      );
      const group = rows[0];
      if (!group) return reply.code(404).send({ error: "invitación inválida o caducada" });
      await pool.query(
        "INSERT INTO memberships (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [group.id, req.user.id],
      );
      return group;
    });

    // ---------- Sincronización de items ----------
    priv.post("/groups/:id/sync", async (req, reply) => {
      const { id } = uuidParam.parse(req.params);
      const { since, changes } = syncRequestSchema.parse(req.body);
      if (!(await requireMember(req, reply, id))) return;
      const g = await pool.query("SELECT app FROM groups WHERE id=$1", [id]);
      if (g.rows[0]?.app !== "cestaco") return reply.code(400).send({ error: "este grupo no tiene items que sincronizar" });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Serializa los sync del mismo grupo: así el orden de `seq` coincide con el de commit
        // y ningún cliente se salta cambios con un cursor.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [id]);

        for (const c of changes) {
          // LWW: solo gana si es más reciente. Un item no puede cambiar de grupo.
          await client.query(
            `INSERT INTO items (id, group_id, name, quantity, checked, deleted, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name, quantity = EXCLUDED.quantity, checked = EXCLUDED.checked,
               deleted = EXCLUDED.deleted, updated_at = EXCLUDED.updated_at, seq = nextval('items_seq')
             WHERE items.group_id = EXCLUDED.group_id AND items.updated_at < EXCLUDED.updated_at`,
            [c.id, id, c.name, c.quantity, c.checked, c.deleted, c.updatedAt],
          );
        }

        // Cambios nuevos + versión ganadora de lo enviado (para que el cliente limpie su estado "sucio")
        const { rows } = await client.query(
          `SELECT id, name, quantity, checked, deleted, updated_at AS "updatedAt", seq
           FROM items WHERE group_id = $1 AND (seq > $2 OR id = ANY($3::uuid[])) ORDER BY seq`,
          [id, since, changes.map((c) => c.id)],
        );
        await client.query("COMMIT");

        const cursor = rows.reduce((m, r) => Math.max(m, r.seq as number), since);
        const items: Item[] = rows.map(({ seq: _seq, ...item }) => item);
        const res: SyncResponse = { items, cursor };
        return res;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    });
  });
}
