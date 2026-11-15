import { api } from "../../api";
import { db, type LocalItem } from "../../db";

interface Run { again: boolean; promise: Promise<void> }
const running = new Map<string, Run>();

/**
 * Sincroniza los items de un grupo (push de cambios locales + pull de remotos). No hay dos a la vez,
 * pero si se pide una mientras otra está en curso, se encadena una segunda pasada: la primera pudo
 * empezar antes de guardar el último cambio local. La promesa devuelta incluye esa segunda pasada.
 */
export function syncGroup(groupId: string): Promise<void> {
  const cur = running.get(groupId);
  if (cur) { cur.again = true; return cur.promise; }
  const run: Run = { again: false, promise: undefined as unknown as Promise<void> };
  run.promise = (async () => {
    try {
      do { run.again = false; await doSync(groupId); } while (run.again);
    } finally {
      running.delete(groupId);
    }
  })();
  running.set(groupId, run);
  return run.promise;
}

async function doSync(groupId: string) {
  const cursorKey = `cursor:${groupId}`;
  const since = (await db.meta.get(cursorKey))?.value ?? 0;
  const dirty = await db.items.where("[groupId+dirty]").equals([groupId, 1]).toArray();
  const changes = dirty.map(({ groupId: _g, dirty: _d, ...item }) => item);

  const res = await api.sync(groupId, { since, changes });

  await db.transaction("rw", db.items, db.meta, async () => {
    for (const remote of res.items) {
      const local = await db.items.get(remote.id);
      // Si el usuario lo editó mientras sincronizábamos, se conserva y se enviará en el próximo sync.
      if (local && local.dirty === 1 && local.updatedAt > remote.updatedAt) continue;
      await db.items.put({ ...remote, groupId, dirty: 0 });
    }
    await db.meta.put({ key: cursorKey, value: res.cursor });
  });
}

// ---------- Mutaciones locales (offline-first) ----------
const now = () => Date.now();

export const addItem = (groupId: string, name: string, quantity = "") =>
  db.items.add({
    id: crypto.randomUUID(), groupId, name: name.trim(), quantity: quantity.trim(),
    checked: false, deleted: false, updatedAt: now(), position: now(), dirty: 1,
  });

export const updateItem = (id: string, patch: Partial<Pick<LocalItem, "name" | "quantity" | "checked" | "deleted" | "position">>) =>
  db.items.update(id, { ...patch, updatedAt: now(), dirty: 1 });
