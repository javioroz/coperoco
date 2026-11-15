// Lógica de dominio de FavoresCo: ranking de amistad y sorteo de la próxima tarea.

export interface FavorLike {
  id: string;
  /** quien hizo el favor: es quien recibe los puntos */
  madeBy: string;
  /** -10..+10 */
  score: number;
  nickname?: string;
  /** YYYY-MM-DD */
  date: string;
  createdAt?: number;
  deleted?: boolean;
}

export interface RankEntry {
  memberId: string;
  score: number;
  count: number;
  /** último mote asignado por la IA ("" si no hay) */
  nickname: string;
}

/**
 * Clasificación: suma de los puntos de los favores que ha hecho cada persona, de más a menos.
 * Incluye a `memberIds` aunque no hayan hecho ningún favor (0 puntos). El mote es el del favor más reciente que lo tenga.
 */
export function rankMembers(favors: FavorLike[], memberIds: string[]): RankEntry[] {
  const byMember = new Map<string, FavorLike[]>(memberIds.map((id) => [id, []]));
  for (const f of favors) {
    if (f.deleted) continue;
    const list = byMember.get(f.madeBy) ?? [];
    list.push(f);
    byMember.set(f.madeBy, list);
  }
  const entries: RankEntry[] = [...byMember].map(([memberId, list]) => {
    const latest = [...list]
      .filter((f) => f.nickname)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
    return { memberId, score: list.reduce((s, f) => s + f.score, 0), count: list.length, nickname: latest?.nickname ?? "" };
  });
  return entries.sort((a, b) => b.score - a.score || b.count - a.count || (a.memberId < b.memberId ? -1 : 1));
}

/**
 * Pesos del sorteo de "la próxima tarea": cuantos MÁS puntos, MENOS probabilidad (para repartir la carga).
 * Los puntos ≤ 0 cuentan como 1. Si todos pesan 0 (una sola persona) el reparto es uniforme.
 */
export function raffleWeights(scores: number[]): number[] {
  const eff = scores.map((s) => Math.max(s, 1));
  const total = eff.reduce((a, b) => a + b, 0);
  const w = eff.map((e) => total - e);
  return w.some((x) => x > 0) ? w : eff.map(() => 1);
}

/** Elige un índice según los pesos. `rand` ∈ [0, 1). */
export function pickRaffle(scores: number[], rand: number): number {
  const w = raffleWeights(scores);
  let r = rand * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) {
    r -= w[i]!;
    if (r < 0) return i;
  }
  return w.length - 1;
}
