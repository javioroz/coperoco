import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../../api";
import { db } from "../../db";
import type { GroupContentProps } from "../registry";
import { addItem, syncGroup, updateItem } from "./sync";

/** Items por comprar (no marcados ni borrados) de una cesta, desde datos locales. */
export function CestaBadge({ groupId }: { groupId: string }) {
  const n = useLiveQuery(
    () => db.items.where("groupId").equals(groupId).filter((i) => !i.checked && !i.deleted).count(),
    [groupId],
  ) ?? 0;
  return <span className={`badge ${n === 0 ? "zero" : ""}`} aria-label={`${n} items por comprar`}>{n}</span>;
}

export default function CestaContent({ group, onGone }: GroupContentProps) {
  const id = group.id;
  const items = useLiveQuery(
    () => db.items.where("groupId").equals(id).filter((i) => !i.deleted).toArray()
      .then((a) => a.sort((x, y) => Number(x.checked) - Number(y.checked) || x.name.localeCompare(y.name))),
    [id],
  );
  const pending = useLiveQuery(() => db.items.where("[groupId+dirty]").equals([id, 1]).count(), [id]);

  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "syncing" | "offline" | "error">("idle");

  const sync = useCallback(async () => {
    setStatus("syncing");
    try {
      await syncGroup(id);
      setStatus("idle");
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 404) return onGone();
        setStatus("error");
      } else setStatus("offline");
    }
  }, [id, onGone]);

  // Sincroniza al abrir el grupo y al recuperar conexión
  useEffect(() => {
    void sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [sync]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await addItem(id, name);
    setName("");
  }

  const label = { idle: "Sincronizado", syncing: "Sincronizando…", offline: "Sin conexión", error: "Error al sincronizar" }[status];

  return (
    <>
      <div className="row between">
        <p className="muted">{label}{pending ? ` · ${pending} pendiente(s)` : ""}</p>
        <button onClick={sync} disabled={status === "syncing"}>🔄 Sincronizar</button>
      </div>

      <form onSubmit={add} className="row">
        <input placeholder="Añadir item…" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <button>Añadir</button>
      </form>

      <ul className="list">
        {items?.map((i) => (
          <li key={i.id} className={i.checked ? "done" : ""}>
            <label>
              <input type="checkbox" checked={i.checked} onChange={(e) => updateItem(i.id, { checked: e.target.checked })} />
              <span>{i.name}</span>
            </label>
            <button className="link" aria-label="Eliminar" onClick={() => updateItem(i.id, { deleted: true })}>✕</button>
          </li>
        ))}
        {items?.length === 0 && <li className="muted">La cesta está vacía.</li>}
      </ul>
    </>
  );
}
