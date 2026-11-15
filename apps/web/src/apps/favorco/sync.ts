import { api } from "../../api";
import { db } from "../../db";

interface Run { again: boolean; promise: Promise<void> }
const running = new Map<string, Run>();

/**
 * Sincroniza los favores de un grupo (push de cambios locales + pull de remotos). No hay dos a la vez, pero si se
 * pide una mientras otra está en curso, se encadena una segunda pasada (la primera pudo empezar antes de guardar
 * el último cambio local). La promesa devuelta incluye esa segunda pasada.
 */
export function syncFavors(groupId: string): Promise<void> {
  const cur = running.get(groupId);
  if (cur) { cur.again = true; return cur.promise; }
  const run: Run = { again: false, promise: undefined as unknown as Promise<void> };
  run.promise = (async () => {
    try { do { run.again = false; await doSync(groupId); } while (run.again); }
    finally { running.delete(groupId); }
  })();
  running.set(groupId, run);
  return run.promise;
}

async function doSync(groupId: string) {
  const cursorKey = `fcursor:${groupId}`;
  const since = (await db.meta.get(cursorKey))?.value ?? 0;
  const dirty = await db.favors.where("[groupId+dirty]").equals([groupId, 1]).toArray();
  const changes = dirty.map(({ groupId: _g, dirty: _d, ...f }) => f);

  const res = await api.syncFavors(groupId, { since, changes });

  await db.transaction("rw", db.favors, db.meta, async () => {
    for (const remote of res.items) {
      const local = await db.favors.get(remote.id);
      // Editado mientras sincronizábamos: se conserva y se enviará en el próximo sync.
      if (local && local.dirty === 1 && local.updatedAt > remote.updatedAt) continue;
      await db.favors.put({ ...remote, groupId, dirty: 0 });
    }
    await db.meta.put({ key: cursorKey, value: res.cursor });
  });
}

// ---------- Mutaciones locales (offline-first) ----------
export interface FavorInput {
  description: string;
  madeBy: string;
  affected: string[];
  date: string; // YYYY-MM-DD
  score: number;
  ai: boolean;
  aiComment: string;
  nickname: string;
}

export const addFavor = (groupId: string, f: FavorInput) =>
  db.favors.add({ ...f, id: crypto.randomUUID(), groupId, createdAt: Date.now(), deleted: false, updatedAt: Date.now(), dirty: 1 });

export const updateFavor = (id: string, patch: Partial<FavorInput & { deleted: boolean }>) =>
  db.favors.update(id, { ...patch, updatedAt: Date.now(), dirty: 1 });
