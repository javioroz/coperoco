import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createGroupSchema,
  updateGroupSchema,
  credentialsSchema,
  registerSchema,
  syncRequestSchema,
  expenseSyncRequestSchema,
  type AuthResponse,
  type Expense,
  type ExpenseSyncResponse,
  type Group,
  type SignupInvite,
  type Item,
  type SyncResponse,
} from "@coperoco/shared";
import { bearer, createSession, destroySession, hashPassword, requireMember, requireUser, verifyPassword } from "./auth.js";
import { newInviteCode } from "./codes.js";
import { pool } from "./db.js";

const uuidParam = z.object({ id: z.string().uuid() });
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_OPEN_SIGNUP_INVITES = 5; // invitaciones de plataforma sin usar que puede tener un usuario a la vez
const INVALID_INVITE = "código de invitación inválido o caducado";

export async function routes(app: FastifyInstance) {
  // ---------- Auth ----------
  // Registro: solo con invitación. Límite por IP para frenar el abuso / la adivinación de códigos.
  app.post("/auth/register", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    const { username, password, inviteCode } = registerSchema.parse(req.body);

    // Comprobación barata antes de gastar CPU en el hash de la contraseña
    const probe = await pool.query(
      `SELECT 1 FROM signup_invites WHERE code = $1 AND used_at IS NULL AND expires_at > now()
       UNION ALL SELECT 1 FROM invites WHERE code = $1 AND expires_at > now()`,
      [inviteCode],
    );
    if (!probe.rowCount) return reply.code(403).send({ error: INVALID_INVITE });

    const hash = await hashPassword(password);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1) ¿invitación de plataforma? (se bloquea la fila: un solo uso aunque lleguen dos registros a la vez)
      let invitedBy: string | null = null;
      let group: Group | null = null;
      const platform = await client.query(
        "SELECT created_by FROM signup_invites WHERE code = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE",
        [inviteCode],
      );
      if (platform.rows[0]) {
        invitedBy = platform.rows[0].created_by;
      } else {
        // 2) ¿enlace de invitación a un grupo? también permite crear cuenta y entra directamente al grupo
        const gi = await client.query(
          `SELECT g.id, g.app, g.name, g.emoji, i.created_by
           FROM invites i JOIN groups g ON g.id = i.group_id WHERE i.code = $1 AND i.expires_at > now()`,
          [inviteCode],
        );
        if (!gi.rows[0]) { await client.query("ROLLBACK"); return reply.code(403).send({ error: INVALID_INVITE }); }
        const { created_by, ...g } = gi.rows[0];
        invitedBy = created_by;
        group = g;
      }

      const created = await client.query(
        `INSERT INTO users (username, password_hash, invited_by) VALUES ($1, $2, $3)
         ON CONFLICT (username) DO NOTHING RETURNING id, username`,
        [username, hash, invitedBy],
      );
      const user = created.rows[0];
      if (!user) { await client.query("ROLLBACK"); return reply.code(409).send({ error: "el usuario ya existe" }); }

      if (group) await client.query("INSERT INTO memberships (group_id, user_id) VALUES ($1, $2)", [group.id, user.id]);
      else await client.query("UPDATE signup_invites SET used_by = $2, used_at = now() WHERE code = $1", [inviteCode, user.id]);

      await client.query("COMMIT");
      const res: AuthResponse = { token: await createSession(user.id), user, ...(group && { group }) };
      return res;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });

  app.post("/auth/login", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (req, reply) => {
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

    // ---------- Invitaciones de plataforma (para que otra persona cree cuenta) ----------
    priv.get("/signup-invites", async (req) => {
      const { rows } = await pool.query(
        `SELECT s.code, (extract(epoch FROM s.expires_at) * 1000)::bigint AS "expiresAt", u.username AS "usedBy"
         FROM signup_invites s LEFT JOIN users u ON u.id = s.used_by
         WHERE s.created_by = $1 ORDER BY s.created_at DESC LIMIT 20`,
        [req.user.id],
      );
      return rows as SignupInvite[];
    });

    priv.post("/signup-invites", async (req, reply) => {
      const open = await pool.query(
        "SELECT count(*)::int AS n FROM signup_invites WHERE created_by = $1 AND used_at IS NULL AND expires_at > now()",
        [req.user.id],
      );
      if (open.rows[0].n >= MAX_OPEN_SIGNUP_INVITES)
        return reply.code(400).send({ error: `Ya tienes ${MAX_OPEN_SIGNUP_INVITES} invitaciones sin usar. Espera a que se usen o caduquen.` });
      const code = newInviteCode(10);
      const expiresAt = Date.now() + INVITE_TTL_MS;
      await pool.query("INSERT INTO signup_invites (code, created_by, expires_at) VALUES ($1, $2, to_timestamp($3/1000.0))", [code, req.user.id, expiresAt]);
      const res: SignupInvite = { code, expiresAt, usedBy: null };
      return res;
    });

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
            `INSERT INTO items (id, group_id, name, quantity, checked, deleted, updated_at, position)
             VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8::float8, $7::bigint::float8))
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name, quantity = EXCLUDED.quantity, checked = EXCLUDED.checked,
               deleted = EXCLUDED.deleted, updated_at = EXCLUDED.updated_at,
               position = COALESCE($8::float8, items.position), seq = nextval('items_seq')
             WHERE items.group_id = EXCLUDED.group_id AND items.updated_at < EXCLUDED.updated_at`,
            [c.id, id, c.name, c.quantity, c.checked, c.deleted, c.updatedAt, c.position ?? null],
          );
        }

        // Cambios nuevos + versión ganadora de lo enviado (para que el cliente limpie su estado "sucio")
        const { rows } = await client.query(
          `SELECT id, name, quantity, checked, deleted, updated_at AS "updatedAt", position, seq
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

    // ---------- GastoCo: sincronización de gastos ----------
    priv.post("/groups/:id/expenses/sync", async (req, reply) => {
      const { id } = uuidParam.parse(req.params);
      const { since, changes } = expenseSyncRequestSchema.parse(req.body);
      if (!(await requireMember(req, reply, id))) return;
      const g = await pool.query("SELECT app FROM groups WHERE id=$1", [id]);
      if (g.rows[0]?.app !== "gastoco") return reply.code(400).send({ error: "este grupo no tiene gastos" });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`expenses:${id}`]);

        for (const c of changes) {
          // LWW: solo gana si es más reciente. Un gasto no puede cambiar de grupo ni de fecha de creación.
          await client.query(
            `INSERT INTO expenses (id, group_id, description, amount_cents, paid_by, shared_by, category, date, created_at, deleted, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6::uuid[],$7,$8,$9,$10,$11)
             ON CONFLICT (id) DO UPDATE SET
               description = EXCLUDED.description, amount_cents = EXCLUDED.amount_cents, paid_by = EXCLUDED.paid_by,
               shared_by = EXCLUDED.shared_by, category = EXCLUDED.category, date = EXCLUDED.date,
               deleted = EXCLUDED.deleted, updated_at = EXCLUDED.updated_at, seq = nextval('expenses_seq')
             WHERE expenses.group_id = EXCLUDED.group_id AND expenses.updated_at < EXCLUDED.updated_at`,
            [c.id, id, c.description, c.amountCents, c.paidBy, c.sharedBy, c.category, c.date, c.createdAt, c.deleted, c.updatedAt],
          );
        }

        const { rows } = await client.query(
          `SELECT id, description, amount_cents AS "amountCents", paid_by AS "paidBy", shared_by AS "sharedBy",
                  category, date, created_at AS "createdAt", deleted, updated_at AS "updatedAt", seq
           FROM expenses WHERE group_id = $1 AND (seq > $2 OR id = ANY($3::uuid[])) ORDER BY seq`,
          [id, since, changes.map((c) => c.id)],
        );
        await client.query("COMMIT");

        const cursor = rows.reduce((m, r) => Math.max(m, r.seq as number), since);
        const items: Expense[] = rows.map(({ seq: _seq, ...e }) => e);
        const res: ExpenseSyncResponse = { items, cursor };
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
