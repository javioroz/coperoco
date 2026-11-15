import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ApiError } from "../../api";
import { CheckIcon, GripIcon, PlusIcon, SyncIcon } from "../../components/icons";
import { db, type LocalItem } from "../../db";
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

type Editing = { id: string; name: string; quantity: string };
const pos = (i: LocalItem) => i.position ?? i.updatedAt; // items antiguos sin posición

/** Una fila de la lista. Solo los items sin marcar se pueden reordenar (con el asa). */
type ItemPatch = Parameters<typeof updateItem>[1];

function ItemRow({ item, sortable, editing, setEditing, onSave, onUpdate }: {
  item: LocalItem; sortable: boolean; editing: Editing | null;
  setEditing: Dispatch<SetStateAction<Editing | null>>; onSave: (e: FormEvent) => void;
  onUpdate: (id: string, patch: ItemPatch) => void;
}) {
  const isEditing = editing?.id === item.id;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !sortable || isEditing });
  const style = { transform: CSS.Translate.toString(transform), transition };

  if (isEditing) {
    return (
      <li ref={setNodeRef} style={style}>
        <form onSubmit={onSave} className="row edit-row" onKeyDown={(e) => e.key === "Escape" && setEditing(null)}>
          <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={200} autoFocus required aria-label="Nombre" />
          <input className="qty-input" placeholder="Cant." value={editing.quantity} onChange={(e) => setEditing({ ...editing, quantity: e.target.value })}
            maxLength={50} aria-label="Cantidad" />
          <button className="squircle-btn" aria-label="Guardar" title="Guardar"><CheckIcon /></button>
        </form>
      </li>
    );
  }

  return (
    <li ref={setNodeRef} style={style} className={`${item.checked ? "done" : ""} ${isDragging ? "dragging" : ""}`}>
      {sortable
        ? <button type="button" ref={setActivatorNodeRef} className="drag-handle" aria-label="Arrastrar para reordenar" {...attributes} {...listeners}><GripIcon /></button>
        : <span className="handle-spacer" />}
      <label>
        <input type="checkbox" checked={item.checked} onChange={(e) => onUpdate(item.id, { checked: e.target.checked })} />
        <span className="item-name" onClick={(e) => { e.preventDefault(); setEditing({ id: item.id, name: item.name, quantity: item.quantity }); }}>
          {item.name}
        </span>
      </label>
      {item.quantity && <span className="qty-chip">{item.quantity}</span>}
      <button className="link" aria-label="Eliminar" onClick={() => onUpdate(item.id, { deleted: true })}>✕</button>
    </li>
  );
}

export default function CestaContent({ group, onGone }: GroupContentProps) {
  const id = group.id;
  const items = useLiveQuery(
    () => db.items.where("groupId").equals(id).filter((i) => !i.deleted).toArray()
      .then((a) => a.sort((x, y) => Number(x.checked) - Number(y.checked) || pos(x) - pos(y) || x.id.localeCompare(y.id))),
    [id],
  );
  const pending = useLiveQuery(() => db.items.where("[groupId+dirty]").equals([id, 1]).count(), [id]);

  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [status, setStatus] = useState<"idle" | "syncing" | "offline" | "error">("idle");

  // Orden optimista durante el drop, hasta que IndexedDB emite el cambio (evita un salto visual)
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  useEffect(() => setLocalOrder(null), [items]);

  const todo = useMemo(() => {
    const u = items?.filter((i) => !i.checked) ?? [];
    if (!localOrder) return u;
    const idx = new Map(localOrder.map((x, n) => [x, n]));
    return [...u].sort((a, b) => (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9));
  }, [items, localOrder]);
  const done = useMemo(() => items?.filter((i) => i.checked) ?? [], [items]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = todo.findIndex((i) => i.id === active.id);
    const to = todo.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(todo, from, to);
    // Posición fraccional entre los nuevos vecinos
    const before = next[to - 1], after = next[to + 1];
    const position = before && after ? (pos(before) + pos(after)) / 2 : before ? pos(before) + 1 : after ? pos(after) - 1 : pos(next[to]!);
    setLocalOrder(next.map((i) => i.id));
    change(String(active.id), { position });
  }

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

  /** Cambio local (marcar, borrar, reordenar…) y sincronización automática inmediata. */
  const change = useCallback((itemId: string, patch: ItemPatch) => { void updateItem(itemId, patch).then(() => sync()); }, [sync]);

  // Sincroniza al abrir el grupo y al recuperar conexión
  useEffect(() => {
    void sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [sync]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await addItem(id, name, quantity);
    setName(""); setQuantity("");
    void sync();
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const original = items?.find((i) => i.id === editing.id);
    const n = editing.name.trim(), q = editing.quantity.trim();
    if (original && n && (n !== original.name || q !== original.quantity)) { await updateItem(editing.id, { name: n, quantity: q }); void sync(); }
    setEditing(null);
  }

  const label = { idle: "Sincronizado", syncing: "Sincronizando…", offline: "Sin conexión", error: "Error al sincronizar" }[status];
  const rowProps = { editing, setEditing, onSave: saveEdit, onUpdate: change };

  return (
    <>
      <div className="row between">
        <p className="muted">{label}{pending ? ` · ${pending} pendiente(s)` : ""}</p>
        <button className={`round-btn ${status === "syncing" ? "spin" : ""}`} onClick={sync} disabled={status === "syncing"}
          aria-label="Sincronizar" title="Sincronizar">
          <SyncIcon />
        </button>
      </div>

      <form onSubmit={add} className="row">
        <input placeholder="Añadir item…" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus />
        <input className="qty-input" placeholder="Cant." value={quantity} onChange={(e) => setQuantity(e.target.value)}
          maxLength={50} aria-label="Cantidad (opcional)" />
        <button className="squircle-btn" aria-label="Añadir" title="Añadir"><PlusIcon /></button>
      </form>

      <ul className="list">
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
          <SortableContext items={todo.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {todo.map((i) => <ItemRow key={i.id} item={i} sortable {...rowProps} />)}
          </SortableContext>
        </DndContext>
        {done.map((i) => <ItemRow key={i.id} item={i} sortable={false} {...rowProps} />)}
        {items?.length === 0 && <li className="muted">La cesta está vacía.</li>}
      </ul>
    </>
  );
}
