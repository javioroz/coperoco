import Dexie, { type Table } from "dexie";
import type { Expense, Favor, Group, Item } from "@coperoco/shared";

/** Item local: dirty=1 => hay cambios pendientes de enviar al servidor. */
export interface LocalItem extends Item {
  groupId: string;
  dirty: 0 | 1; // 0/1 (IndexedDB no indexa booleanos)
}
/** Gasto local (GastosCo), con la misma semántica de `dirty`. */
export interface LocalExpense extends Expense {
  groupId: string;
  dirty: 0 | 1;
}
/** Favor local (FavoresCo), con la misma semántica de `dirty`. */
export interface LocalFavor extends Favor {
  groupId: string;
  dirty: 0 | 1;
}
/** Miembro cacheado para poder mostrar nombres sin conexión. `active=0` => ya no pertenece al grupo. */
export interface LocalMember {
  groupId: string;
  id: string;
  username: string;
  role: "owner" | "member";
  active: 0 | 1;
}
export interface Meta {
  key: string; // p.ej. "cursor:<groupId>"
  value: number;
}

class CoPeroCoDB extends Dexie {
  groups!: Table<Group, string>;
  items!: Table<LocalItem, string>;
  expenses!: Table<LocalExpense, string>;
  favors!: Table<LocalFavor, string>;
  members!: Table<LocalMember, [string, string]>;
  meta!: Table<Meta, string>;
  constructor() {
    super("coperoco");
    const stores = { groups: "id, app", items: "id, groupId, [groupId+dirty]", meta: "key" };
    this.version(1).stores(stores);
    // v2: orden manual. Los items existentes toman su fecha como posición.
    this.version(2).stores(stores).upgrade((tx) =>
      tx.table("items").toCollection().modify((i) => { i.position ??= i.updatedAt; }));
    // v3: GastosCo
    this.version(3).stores({
      expenses: "id, groupId, [groupId+dirty]",
      members: "[groupId+id], groupId",
    });
    // v4: FavoresCo
    this.version(4).stores({ favors: "id, groupId, [groupId+dirty]" });
  }
}

export const db = new CoPeroCoDB();

export async function clearLocalData() {
  await Promise.all([db.groups.clear(), db.items.clear(), db.expenses.clear(), db.favors.clear(), db.members.clear(), db.meta.clear()]);
}
