import Dexie, { type Table } from "dexie";
import type { Group, Item } from "@coperoco/shared";

/** Item local: dirty=1 => hay cambios pendientes de enviar al servidor. */
export interface LocalItem extends Item {
  groupId: string;
  dirty: 0 | 1; // 0/1 (IndexedDB no indexa booleanos)
}
export interface Meta {
  key: string; // p.ej. "cursor:<groupId>"
  value: number;
}

class CestaDB extends Dexie {
  groups!: Table<Group, string>;
  items!: Table<LocalItem, string>;
  meta!: Table<Meta, string>;
  constructor() {
    super("coperoco");
    this.version(1).stores({ groups: "id, app", items: "id, groupId, [groupId+dirty]", meta: "key" });
  }
}

export const db = new CestaDB();

export async function clearLocalData() {
  await Promise.all([db.groups.clear(), db.items.clear(), db.meta.clear()]);
}
