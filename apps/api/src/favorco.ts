import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  DEFAULT_LLM_ENDPOINT, DEFAULT_LLM_MODEL, evaluateFavorSchema, favorSyncRequestSchema, llmConfigSchema,
  type Favor, type FavorEvaluation, type FavorSyncResponse, type LlmConfigStatus,
} from "@coperoco/shared";
import { bearer, requireMember } from "./auth.js";
import { pool } from "./db.js";
import { evaluateFavor, LlmError } from "./llm.js";
import { assertSafeUrl, isPublicAddress, ALLOW_PRIVATE, UnsafeUrlError } from "./netguard.js";
import { decryptSecret, encryptSecret, secretsAvailable } from "./secrets.js";
import dns from "node:dns/promises";

const idParam = z.object({ id: z.string().uuid() });

/** Rutas de FavoresCo. Se registran dentro del ámbito autenticado (req.user disponible). */
export async function favorcoRoutes(app: FastifyInstance) {
  async function ensureFavorGroup(id: string, reply: import("fastify").FastifyReply) {
    const g = await pool.query("SELECT app, name FROM groups WHERE id = $1", [id]);
    if (g.rows[0]?.app !== "favorco") { reply.code(400).send({ error: "este grupo no es de FavoresCo" }); return null; }
    return g.rows[0] as { app: string; name: string };
  }
  async function isOwner(groupId: string, userId: string) {
    const r = await pool.query("SELECT role FROM memberships WHERE group_id=$1 AND user_id=$2", [groupId, userId]);
    return r.rows[0]?.role === "owner";
  }

  // ---------- Sincronización de favores (mismo esquema que items/gastos) ----------
  app.post("/groups/:id/favors/sync", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { since, changes } = favorSyncRequestSchema.parse(req.body);
    if (!(await requireMember(req, reply, id))) return;
    if (!(await ensureFavorGroup(id, reply))) return;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`favors:${id}`]);
      for (const c of changes) {
        // LWW: solo gana si es más reciente. Un favor no puede cambiar de grupo.
        await client.query(
          `INSERT INTO favors (id, group_id, description, made_by, affected, date, score, ai, ai_comment, nickname, created_at, deleted, updated_at)
           VALUES ($1,$2,$3,$4,$5::uuid[],$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (id) DO UPDATE SET
             description = EXCLUDED.description, made_by = EXCLUDED.made_by, affected = EXCLUDED.affected, date = EXCLUDED.date,
             score = EXCLUDED.score, ai = EXCLUDED.ai, ai_comment = EXCLUDED.ai_comment, nickname = EXCLUDED.nickname,
             deleted = EXCLUDED.deleted, updated_at = EXCLUDED.updated_at, seq = nextval('favors_seq')
           WHERE favors.group_id = EXCLUDED.group_id AND favors.updated_at < EXCLUDED.updated_at`,
          [c.id, id, c.description, c.madeBy, c.affected, c.date, c.score, c.ai, c.aiComment, c.nickname, c.createdAt, c.deleted, c.updatedAt],
        );
      }
      const { rows } = await client.query(
        `SELECT id, description, made_by AS "madeBy", affected, date, score, ai, ai_comment AS "aiComment", nickname,
                created_at AS "createdAt", deleted, updated_at AS "updatedAt", seq
         FROM favors WHERE group_id = $1 AND (seq > $2 OR id = ANY($3::uuid[])) ORDER BY seq`,
        [id, since, changes.map((c) => c.id)],
      );
      await client.query("COMMIT");
      const cursor = rows.reduce((m, r) => Math.max(m, r.seq as number), since);
      const items: Favor[] = rows.map(({ seq: _seq, ...f }) => f);
      const res: FavorSyncResponse = { items, cursor };
      return res;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });

  // ---------- Configuración de la IA del grupo (la clave nunca sale del servidor) ----------
  app.get("/groups/:id/llm", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    if (!(await requireMember(req, reply, id))) return;
    if (!(await ensureFavorGroup(id, reply))) return;
    const { rows } = await pool.query("SELECT endpoint, model FROM group_llm WHERE group_id = $1", [id]);
    const res: LlmConfigStatus = {
      configured: !!rows[0], endpoint: rows[0]?.endpoint ?? DEFAULT_LLM_ENDPOINT, model: rows[0]?.model ?? DEFAULT_LLM_MODEL, available: secretsAvailable(),
    };
    return res;
  });

  app.put("/groups/:id/llm", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const cfg = llmConfigSchema.parse(req.body);
    if (!(await requireMember(req, reply, id))) return;
    if (!(await ensureFavorGroup(id, reply))) return;
    if (!(await isOwner(id, req.user.id))) return reply.code(403).send({ error: "solo el creador del grupo puede configurar la IA" });
    if (!secretsAvailable()) return reply.code(503).send({ error: "El servidor no tiene configurada SECRETS_KEY: no puede guardar claves de API" });

    // Validación temprana (la protección real se vuelve a aplicar en cada llamada)
    try {
      const u = assertSafeUrl(cfg.endpoint);
      if (!ALLOW_PRIVATE) {
        const addrs = await dns.lookup(u.hostname.replace(/^\[|\]$/g, ""), { all: true }).catch(() => []);
        if (!addrs.length) return reply.code(400).send({ error: "No se pudo resolver la dirección de la API" });
        if (!addrs.some((a) => isPublicAddress(a.address))) return reply.code(400).send({ error: "No se permiten direcciones internas" });
      }
    } catch (e) {
      if (e instanceof UnsafeUrlError) return reply.code(400).send({ error: e.message });
      throw e;
    }

    const existing = await pool.query("SELECT 1 FROM group_llm WHERE group_id = $1", [id]);
    if (!cfg.apiKey && !existing.rowCount) return reply.code(400).send({ error: "Falta la clave de la API" });
    if (cfg.apiKey) {
      await pool.query(
        `INSERT INTO group_llm (group_id, endpoint, model, api_key_enc, updated_by) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (group_id) DO UPDATE SET endpoint=$2, model=$3, api_key_enc=$4, updated_by=$5, updated_at=now()`,
        [id, cfg.endpoint, cfg.model, encryptSecret(cfg.apiKey), req.user.id],
      );
    } else {
      await pool.query("UPDATE group_llm SET endpoint=$2, model=$3, updated_by=$4, updated_at=now() WHERE group_id=$1", [id, cfg.endpoint, cfg.model, req.user.id]);
    }
    const res: LlmConfigStatus = { configured: true, endpoint: cfg.endpoint, model: cfg.model, available: true };
    return res;
  });

  app.delete("/groups/:id/llm", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    if (!(await requireMember(req, reply, id))) return;
    if (!(await isOwner(id, req.user.id))) return reply.code(403).send({ error: "solo el creador del grupo puede configurar la IA" });
    await pool.query("DELETE FROM group_llm WHERE group_id = $1", [id]);
    return { ok: true };
  });

  // ---------- Puntuar un favor con la IA ----------
  // Límite por sesión: cada llamada gasta la cuota de la API del creador del grupo.
  app.post("/groups/:id/favors/evaluate", {
    config: { rateLimit: { max: 30, timeWindow: "1 hour", keyGenerator: (req: import("fastify").FastifyRequest) => bearer(req) ?? req.ip } },
  }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const input = evaluateFavorSchema.parse(req.body);
    if (!(await requireMember(req, reply, id))) return;
    const group = await ensureFavorGroup(id, reply);
    if (!group) return;

    const cfgRow = (await pool.query("SELECT endpoint, model, api_key_enc FROM group_llm WHERE group_id = $1", [id])).rows[0];
    if (!cfgRow) return reply.code(400).send({ error: "Este grupo no tiene la IA configurada" });
    const apiKey = decryptSecret(cfgRow.api_key_enc);
    if (!apiKey) return reply.code(400).send({ error: "No se pudo descifrar la clave de la IA. El creador debe volver a guardarla." });

    // Solo miembros actuales: no se envían al proveedor nombres de personas ajenas al grupo
    const members = (await pool.query("SELECT u.id, u.username FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.group_id = $1", [id])).rows as { id: string; username: string }[];
    const name = new Map(members.map((m) => [m.id, m.username]));
    if (!name.has(input.madeBy)) return reply.code(400).send({ error: "Quien hace el favor debe ser miembro del grupo" });
    const affected = input.affected.filter((a) => a !== input.madeBy && name.has(a));

    const history = (await pool.query(
      "SELECT description, score FROM favors WHERE group_id=$1 AND made_by=$2 AND NOT deleted ORDER BY date DESC, created_at DESC LIMIT 5", [id, input.madeBy])).rows;
    const total = (await pool.query("SELECT COALESCE(SUM(score),0)::int AS s FROM favors WHERE group_id=$1 AND made_by=$2 AND NOT deleted", [id, input.madeBy])).rows[0].s as number;
    const nicks = (await pool.query(
      "SELECT DISTINCT nickname FROM favors WHERE group_id=$1 AND made_by=$2 AND nickname <> '' AND NOT deleted LIMIT 5", [id, input.madeBy])).rows.map((r) => r.nickname as string);

    try {
      const out: FavorEvaluation = await evaluateFavor({ endpoint: cfgRow.endpoint, model: cfgRow.model, apiKey }, {
        groupName: group.name, makerName: name.get(input.madeBy)!, affectedNames: affected.map((a) => name.get(a)!), memberCount: members.length,
        description: input.description, date: input.date, history, totalScore: total, previousNicknames: nicks,
      });
      return out;
    } catch (e) {
      if (e instanceof LlmError) return reply.code(502).send({ error: e.message });
      throw e;
    }
  });
}
