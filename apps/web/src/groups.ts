import { api } from "./api";
import { db } from "./db";

/** Refresca la lista local de grupos (de todas las apps) desde el servidor. Lanza si no hay red. */
export async function refreshGroups() {
  const groups = await api.groups();
  await db.transaction("rw", [db.groups, db.items, db.expenses, db.favors, db.members, db.meta], async () => {
    const keep = new Set(groups.map((g) => g.id));
    for (const g of await db.groups.toArray()) {
      if (!keep.has(g.id)) {
        await db.groups.delete(g.id);
        await db.items.where("groupId").equals(g.id).delete();
        await db.expenses.where("groupId").equals(g.id).delete();
        await db.favors.where("groupId").equals(g.id).delete();
        await db.members.where("groupId").equals(g.id).delete();
        await db.meta.delete(`cursor:${g.id}`);
        await db.meta.delete(`xcursor:${g.id}`);
        await db.meta.delete(`fcursor:${g.id}`);
      }
    }
    await db.groups.bulkPut(groups);
  });
}
