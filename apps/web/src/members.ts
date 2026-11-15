import { api } from "./api";
import { db } from "./db";

/** Cachea los miembros del grupo (nombres sin conexión). Los que ya no están quedan como inactivos. */
export async function refreshMembers(groupId: string) {
  const list = await api.members(groupId);
  await db.transaction("rw", db.members, async () => {
    const current = new Set(list.map((m) => m.id));
    await db.members.where("groupId").equals(groupId).modify((m) => { if (!current.has(m.id)) m.active = 0; });
    await db.members.bulkPut(list.map((m) => ({ groupId, id: m.id, username: m.username, role: m.role, active: 1 as const })));
  });
}
