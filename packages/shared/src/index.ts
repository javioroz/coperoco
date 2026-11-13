import { z } from "zod";

// ---------- Auth ----------
export const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(8).max(200),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export interface User {
  id: string;
  username: string;
}
export interface AuthResponse {
  token: string;
  user: User;
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
});
export type Item = z.infer<typeof itemSchema>;

export const syncRequestSchema = z.object({
  /** Último cursor recibido del servidor para este grupo (0 la primera vez). */
  since: z.number().int().nonnegative(),
  /** Cambios locales pendientes de enviar. */
  changes: z.array(itemSchema).max(500),
});
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export interface SyncResponse {
  /** Items modificados desde `since` + versión ganadora de los items enviados. */
  items: Item[];
  /** Nuevo cursor a guardar. */
  cursor: number;
}
