import { useState, type FormEvent } from "react";
import EmojiPicker from "../../components/EmojiPicker";
import Modal from "../../components/Modal";
import type { LocalExpense, LocalMember } from "../../db";
import { eur, parseAmountToCents, todayISO } from "./format";
import { addExpense, updateExpense } from "./sync";

export const CATEGORIES = ["🍺", "🍕", "🛒", "🏠", "🚗", "✈️", "🛠️", "☕", "🎉", "🎟️", "💡", "🧹", "🐾", "💊", "🎁", "💰"];
export const DEFAULT_CATEGORY = "💰";

interface Props {
  /** null = cerrado; "new" = gasto nuevo; un gasto = edición */
  target: "new" | LocalExpense | null;
  groupId: string;
  me: string;
  members: LocalMember[]; // activos
  nameOf: (id: string) => string;
  onClose: () => void;
  /** Se llama tras guardar o eliminar (para forzar la sincronización). */
  onSaved: () => void;
}

export default function ExpenseModal({ target, onClose, ...rest }: Props) {
  return (
    <Modal open={target !== null} onClose={onClose} title={target === "new" ? "Nuevo gasto" : "Editar gasto"}>
      {target && <ExpenseForm key={target === "new" ? "new" : target.id} target={target} onClose={onClose} {...rest} />}
    </Modal>
  );
}

function ExpenseForm({ target, groupId, me, members, nameOf, onClose, onSaved }: Omit<Props, "target"> & { target: "new" | LocalExpense; onClose: () => void }) {
  const editing = target === "new" ? null : target;

  // Quién puede aparecer: miembros activos + (al editar) los ya referenciados que ya no están
  const candidates = [...members.map((m) => m.id)];
  if (!candidates.includes(me)) candidates.push(me);
  if (editing) for (const id of [editing.paidBy, ...editing.sharedBy]) if (!candidates.includes(id)) candidates.push(id);
  const active = new Set(members.map((m) => m.id)).add(me);
  const label = (id: string) => `${nameOf(id)}${id === me ? " (tú)" : ""}${active.has(id) ? "" : " (ex)"}`;

  const [description, setDescription] = useState(editing?.description ?? "");
  const [amountText, setAmountText] = useState(editing ? (editing.amountCents / 100).toFixed(2) : "");
  const [category, setCategory] = useState(editing?.category || DEFAULT_CATEGORY);
  const [showCats, setShowCats] = useState(false);
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [paidBy, setPaidBy] = useState(editing?.paidBy ?? me);
  const [sharedBy, setSharedBy] = useState<Set<string>>(new Set(editing?.sharedBy ?? candidates));
  const [error, setError] = useState("");

  const toggle = (id: string) =>
    setSharedBy((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const amountCents = parseAmountToCents(amountText);
  const preview = amountCents && sharedBy.size ? Math.ceil(amountCents / sharedBy.size) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) return setError("Escribe una descripción");
    if (!amountCents) return setError("Importe no válido (ej. 12,50)");
    if (sharedBy.size === 0) return setError("Elige al menos una persona para repartir");
    const data = {
      description: description.trim(), amountCents, paidBy, category, date,
      sharedBy: candidates.filter((id) => sharedBy.has(id)),
    };
    if (editing) await updateExpense(editing.id, data);
    else await addExpense(groupId, data);
    onClose();
    onSaved();
  }

  async function remove() {
    if (!editing || !confirm("¿Eliminar este gasto?")) return;
    await updateExpense(editing.id, { deleted: true });
    onClose();
    onSaved();
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="row" style={{ margin: 0 }}>
        <input placeholder="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} required autoFocus />
        <button type="button" className="cat-btn" aria-label="Categoría" onClick={() => setShowCats((v) => !v)}>{category}</button>
      </div>
      {showCats && <EmojiPicker emojis={CATEGORIES} value={category} onChange={(c) => { setCategory(c); setShowCats(false); }} />}

      <div className="row" style={{ margin: 0 }}>
        <input inputMode="decimal" placeholder="Importe" value={amountText} onChange={(e) => setAmountText(e.target.value)} aria-label="Importe en euros" required />
        <span className="muted">€</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Fecha" />
      </div>

      <label className="field">
        <span>Pagado por</span>
        <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {candidates.map((id) => <option key={id} value={id}>{label(id)}</option>)}
        </select>
      </label>

      <div className="field">
        <div className="row between" style={{ margin: 0 }}>
          <span>Pagado para</span>
          <button type="button" className="link" onClick={() => setSharedBy(sharedBy.size === candidates.length ? new Set() : new Set(candidates))}>
            {sharedBy.size === candidates.length ? "Ninguno" : "Todos"}
          </button>
        </div>
        <ul className="check-list">
          {candidates.map((id) => (
            <li key={id}>
              <label>
                <input type="checkbox" checked={sharedBy.has(id)} onChange={() => toggle(id)} />
                <span>{label(id)}</span>
              </label>
            </li>
          ))}
        </ul>
        {preview && <p className="muted"><small>≈ {eur(preview)} por persona</small></p>}
      </div>

      {error && <p className="error">{error}</p>}
      <button>{editing ? "Guardar cambios" : "Añadir gasto"}</button>
      {editing && <button type="button" className="danger" onClick={remove}>Eliminar gasto</button>}
    </form>
  );
}
