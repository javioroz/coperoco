import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyReply, FastifyRequest } from "fastify";
import { pool } from "./db.js";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions (token_hash, user_id) VALUES ($1, $2)", [sha256(token), userId]);
  return token;
}

export async function destroySession(token: string) {
  await pool.query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
}

export function bearer(req: FastifyRequest) {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

declare module "fastify" {
  interface FastifyRequest {
    user: { id: string; username: string };
  }
}

/** preHandler: exige sesión válida y rellena req.user */
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const token = bearer(req);
  if (!token) return reply.code(401).send({ error: "no autenticado" });
  const { rows } = await pool.query(
    `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1`,
    [sha256(token)],
  );
  if (!rows[0]) return reply.code(401).send({ error: "sesión inválida" });
  req.user = rows[0];
}

/** Comprueba pertenencia al grupo; responde 404 si no (no revela existencia). */
export async function requireMember(req: FastifyRequest, reply: FastifyReply, groupId: string) {
  const { rowCount } = await pool.query("SELECT 1 FROM memberships WHERE group_id=$1 AND user_id=$2", [
    groupId,
    req.user.id,
  ]);
  if (!rowCount) {
    reply.code(404).send({ error: "grupo no encontrado" });
    return false;
  }
  return true;
}
