import { api } from "../../api";
import { db } from "../../db";

interface Run { again: boolean; promise: Promise<void> }
const running = new Map<string, Run>();

/**
 * Sincroniza los gastos de un grupo (push de cambios locales + pull de remotos). No hay dos a la vez,
 * pero si se pide una mientras otra está en curso, se encadena una segunda pasada: la primera pudo
 * empezar antes de guardar el último cambio local. La promesa devuelta incluye esa segunda pasada.
 */
export function syncExpenses(groupId: string): Promise<void> {
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
  const cursorKey = `xcursor:${groupId}`;
  const since = (await db.meta.get(cursorKey))?.value ?? 0;
  const dirty = await db.expenses.where("[groupId+dirty]").equals([groupId, 1]).toArray();
  const changes = dirty.map(({ groupId: _g, dirty: _d, ...e }) => e);

  const res = await api.syncExpenses(groupId, { since, changes });

  await db.transaction("rw", db.expenses, db.meta, async () => {
    for (const remote of res.items) {
      const local = await db.expenses.get(remote.id);
      // Editado mientras sincronizábamos: se conserva y se enviará en el próximo sync.
      if (local && local.dirty === 1 && local.updatedAt > remote.updatedAt) continue;
      await db.expenses.put({ ...remote, groupId, dirty: 0 });
    }
    await db.meta.put({ key: cursorKey, value: res.cursor });
  });
}

/** Cachea los miembros del grupo (nombres sin conexión). Los que ya no están quedan como inactivos. */
export async function refreshMembers(groupId: string) {
  const list = await api.members(groupId);
  await db.transaction("rw", db.members, async () => {
    const current = new Set(list.map((m) => m.id));
    await db.members.where("groupId").equals(groupId).modify((m) => { if (!current.has(m.id)) m.active = 0; });
    await db.members.bulkPut(list.map((m) => ({ groupId, id: m.id, username: m.username, role: m.role, active: 1 as const })));
  });
}

// ---------- Mutaciones locales (offline-first) ----------
export interface ExpenseInput {
  description: string;
  amountCents: number;
  paidBy: string;
  sharedBy: string[];
  category: string;
  date: string; // YYYY-MM-DD
}

export const addExpense = (groupId: string, e: ExpenseInput) =>
  db.expenses.add({
    ...e, id: crypto.randomUUID(), groupId, createdAt: Date.now(), deleted: false, updatedAt: Date.now(), dirty: 1,
  });

export const updateExpense = (id: string, patch: Partial<ExpenseInput & { deleted: boolean }>) =>
  db.expenses.update(id, { ...patch, updatedAt: Date.now(), dirty: 1 });
