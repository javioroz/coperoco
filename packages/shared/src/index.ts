import { z } from "zod";

// ---------- Auth ----------
export const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(8).max(200),
});
export type Credentials = z.infer<typeof credentialsSchema>;

/** Registro: solo con una invitación (de plataforma o de un grupo). */
export const registerSchema = credentialsSchema.extend({
  inviteCode: z.string().trim().toUpperCase().min(4).max(32),
});
export type RegisterInput = z.infer<typeof registerSchema>;

/** Invitación de plataforma creada por un usuario. */
export interface SignupInvite {
  code: string;
  expiresAt: number;
  /** nombre de quien la usó, o null si sigue disponible */
  usedBy: string | null;
}

export interface User {
  id: string;
  username: string;
}
export interface AuthResponse {
  token: string;
  user: User;
  /** Presente si te registraste con el enlace de invitación a un grupo: ya eres miembro. */
  group?: Group;
}

// ---------- Aplicaciones de la plataforma ----------
export const APP_IDS = ["cestaco", "gastoco", "favorco", "viajeco"] as const;
export const appIdSchema = z.enum(APP_IDS);
export type AppId = z.infer<typeof appIdSchema>;

// ---------- Grupos (cestas, gastos, favores, viajes…) ----------
export const createGroupSchema = z.object({
  app: appIdSchema,
  id: z.string().uuid(), // generado en cliente
  name: z.string().trim().min(1).max(60),
  emoji: z.string().trim().min(1).max(16),
});
export const updateGroupSchema = createGroupSchema.omit({ id: true, app: true });
export interface Group {
  id: string;
  app: AppId;
  name: string;
  emoji: string;
}
export interface Member {
  id: string;
  username: string;
  role: "owner" | "member";
}
export interface Invite {
  code: string;
  expiresAt: number;
}

// ---------- Items + sincronización ----------
// Resolución de conflictos: last-write-wins por `updatedAt` (ms, reloj del cliente).
// Los borrados son lógicos (`deleted`) para poder propagarse a otros dispositivos.
export const itemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  quantity: z.string().max(50),
  checked: z.boolean(),
  deleted: z.boolean(),
  updatedAt: z.number().int().nonnegative(),
  /** Orden manual (menor = antes). */
  position: z.number().finite(),
});
export type Item = z.infer<typeof itemSchema>;

export const syncRequestSchema = z.object({
  /** Último cursor recibido del servidor para este grupo (0 la primera vez). */
  since: z.number().int().nonnegative(),
  /** Cambios locales pendientes de enviar. */
  // `position` opcional: clientes antiguos (PWA en caché) no la envían y se conserva la del servidor.
  changes: z.array(itemSchema.extend({ position: z.number().finite().optional() })).max(500),
});
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export interface SyncResponse {
  /** Items modificados desde `since` + versión ganadora de los items enviados. */
  items: Item[];
  /** Nuevo cursor a guardar. */
  cursor: number;
}
export * from "./gastoco.js";

// ---------- GastosCo: gastos + sincronización ----------
// Mismo esquema que los items de CestaCo: LWW por `updatedAt`, borrado lógico, cursor `seq` del servidor.
export const expenseSchema = z.object({
  id: z.string().uuid(),
  description: z.string().trim().min(1).max(200),
  /** Importe en céntimos (entero > 0). */
  amountCents: z.number().int().positive().max(1_000_000_000),
  /** id de usuario que pagó */
  paidBy: z.string().uuid(),
  /** ids de usuario entre los que se reparte (a partes iguales) */
  sharedBy: z.array(z.string().uuid()).min(1).max(100).refine((a) => new Set(a).size === a.length, "duplicados"),
  category: z.string().max(16),
  /** Día del gasto, YYYY-MM-DD */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.number().int().nonnegative(),
  deleted: z.boolean(),
  updatedAt: z.number().int().nonnegative(),
});
export type Expense = z.infer<typeof expenseSchema>;

export const expenseSyncRequestSchema = z.object({
  since: z.number().int().nonnegative(),
  changes: z.array(expenseSchema).max(500),
});
export type ExpenseSyncRequest = z.infer<typeof expenseSyncRequestSchema>;
export interface ExpenseSyncResponse {
  items: Expense[];
  cursor: number;
}
export * from "./favorco.js";

// ---------- FavoresCo: favores + sincronización ----------
// Mismo esquema que items/gastos: LWW por `updatedAt`, borrado lógico, cursor `seq` del servidor.
export const favorSchema = z.object({
  id: z.string().uuid(),
  description: z.string().trim().min(1).max(300),
  /** quien hizo el favor (recibe los puntos) */
  madeBy: z.string().uuid(),
  /** a quién afecta / beneficia (puede estar vacío = sin destinatario concreto) */
  affected: z.array(z.string().uuid()).max(100).refine((a) => new Set(a).size === a.length, "duplicados"),
  /** Día del favor, YYYY-MM-DD */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Puntuación -10..+10 (manual o puesta por la IA) */
  score: z.number().int().min(-10).max(10),
  /** true = la puntuó la IA */
  ai: z.boolean(),
  /** comentario de la IA ("" si no hay) */
  aiComment: z.string().max(600),
  /** mote que la IA le asignó a quien hizo el favor ("" si no hay) */
  nickname: z.string().max(40),
  createdAt: z.number().int().nonnegative(),
  deleted: z.boolean(),
  updatedAt: z.number().int().nonnegative(),
});
export type Favor = z.infer<typeof favorSchema>;

export const favorSyncRequestSchema = z.object({
  since: z.number().int().nonnegative(),
  changes: z.array(favorSchema).max(500),
});
export type FavorSyncRequest = z.infer<typeof favorSyncRequestSchema>;
export interface FavorSyncResponse {
  items: Favor[];
  cursor: number;
}

// ---------- FavoresCo: puntuación con IA (configuración por grupo, guardada en el servidor) ----------
export const DEFAULT_LLM_ENDPOINT = "https://api.openai.com/v1/chat/completions";
export const DEFAULT_LLM_MODEL = "gpt-4o-mini";

export const llmConfigSchema = z.object({
  /** API compatible con OpenAI (chat/completions) */
  endpoint: z.string().trim().url().max(300),
  model: z.string().trim().min(1).max(100),
  /** Si se omite en una actualización, se conserva la clave actual. Nunca se devuelve. */
  apiKey: z.string().trim().min(8).max(500).optional(),
});
export type LlmConfigInput = z.infer<typeof llmConfigSchema>;
export interface LlmConfigStatus {
  configured: boolean;
  endpoint: string;
  model: string;
  /** false si el servidor no tiene SECRETS_KEY (no puede guardar claves) */
  available: boolean;
}

export const evaluateFavorSchema = z.object({
  description: z.string().trim().min(1).max(300),
  madeBy: z.string().uuid(),
  affected: z.array(z.string().uuid()).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type EvaluateFavorInput = z.infer<typeof evaluateFavorSchema>;
export interface FavorEvaluation {
  score: number;
  comment: string;
  nickname: string;
}
