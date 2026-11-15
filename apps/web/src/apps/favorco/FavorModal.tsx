import { useEffect, useState, type FormEvent } from "react";
import type { LlmConfigStatus } from "@coperoco/shared";
import { api } from "../../api";
import Modal from "../../components/Modal";
import type { LocalFavor, LocalMember } from "../../db";
import { todayISO } from "../../dates";
import { addFavor, updateFavor } from "./sync";

interface Props {
  /** null = cerrado; "new" = favor nuevo; un favor = edición */
  target: "new" | LocalFavor | null;
  groupId: string;
  me: string;
  members: LocalMember[]; // activos
  nameOf: (id: string) => string;
  onClose: () => void;
  /** Se llama tras guardar o eliminar (para forzar la sincronización). */
  onSaved: () => void;
}

export default function FavorModal({ target, onClose, ...rest }: Props) {
  return (
    <Modal open={target !== null} onClose={onClose} title={target === "new" ? "Nuevo favor" : "Editar favor"}>
      {target && <FavorForm key={target === "new" ? "new" : target.id} target={target} onClose={onClose} {...rest} />}
    </Modal>
  );
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function FavorForm({ target, groupId, me, members, nameOf, onClose, onSaved }: Omit<Props, "target"> & { target: "new" | LocalFavor }) {
  const editing = target === "new" ? null : target;

  // Quién puede aparecer: miembros activos + (al editar) los ya referenciados que ya no están
  const candidates = members.map((m) => m.id);
  if (!candidates.includes(me)) candidates.push(me);
  if (editing) for (const id of [editing.madeBy, ...editing.affected]) if (!candidates.includes(id)) candidates.push(id);
  const active = new Set(members.map((m) => m.id)).add(me);
  const label = (id: string) => `${nameOf(id)}${id === me ? " (tú)" : ""}${active.has(id) ? "" : " (ex)"}`;

  const [description, setDescription] = useState(editing?.description ?? "");
  const [madeBy, setMadeBy] = useState(editing?.madeBy ?? me);
  const [affected, setAffected] = useState<Set<string>>(new Set(editing ? editing.affected : candidates.filter((id) => id !== me)));
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [useAI, setUseAI] = useState(editing?.ai ?? false);
  const [score, setScore] = useState(editing?.score ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [llm, setLlm] = useState<LlmConfigStatus | "offline" | null>(null);

  useEffect(() => { api.llmConfig(groupId).then(setLlm).catch(() => setLlm("offline")); }, [groupId]);
  const aiReady = llm !== null && llm !== "offline" && llm.configured;
  const aiHint = llm === null ? "Comprobando…" : llm === "offline" ? "Sin conexión: no se puede puntuar con IA ahora."
    : !llm.available ? "El servidor no tiene activada la puntuación con IA."
    : !llm.configured ? "El creador del grupo debe configurar la IA en Ajustes." : "";

  const others = candidates.filter((id) => id !== madeBy);
  const affectedList = others.filter((id) => affected.has(id));
  const toggle = (id: string) => setAffected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const changeMaker = (id: string) => { setMadeBy(id); setAffected((s) => { const n = new Set(s); n.delete(id); return n; }); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (!description.trim()) return setError("Describe el favor");

    let data = { description: description.trim(), madeBy, affected: affectedList, date, score, ai: false, aiComment: "", nickname: "" };
    if (useAI) {
      // Si ya estaba puntuado por la IA y no cambia nada relevante, se conserva su puntuación (no se gasta otra llamada)
      const unchanged = editing?.ai && editing.description === data.description && editing.madeBy === madeBy && sameSet(editing.affected, affectedList);
      if (unchanged && editing) data = { ...data, score: editing.score, ai: true, aiComment: editing.aiComment, nickname: editing.nickname };
      else {
        setBusy(true);
        try {
          const ev = await api.evaluateFavor(groupId, { description: data.description, madeBy, affected: affectedList, date });
          data = { ...data, score: ev.score, ai: true, aiComment: ev.comment, nickname: ev.nickname };
        } catch (err) {
          setBusy(false);
          const m = err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Sin conexión: no se puede puntuar con IA ahora.";
          return setError(`${m} Puedes reintentar, o desactivar la IA y poner la puntuación a mano.`);
        }
        setBusy(false);
      }
    }
    if (editing) await updateFavor(editing.id, data);
    else await addFavor(groupId, data);
    onClose();
    onSaved();
  }

  async function remove() {
    if (!editing || !confirm("¿Eliminar este favor?")) return;
    await updateFavor(editing.id, { deleted: true });
    onClose();
    onSaved();
  }

  return (
    <form onSubmit={submit} className="stack">
      <textarea placeholder="¿Qué favor ha hecho? (p. ej. «Arregló el grifo del baño»)" value={description}
        onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} required autoFocus />

      <label className="field">
        <span>Hecho por</span>
        <select value={madeBy} onChange={(e) => changeMaker(e.target.value)}>
          {candidates.map((id) => <option key={id} value={id}>{label(id)}</option>)}
        </select>
      </label>

      <div className="field">
        <div className="row between" style={{ margin: 0 }}>
          <span>Afecta a</span>
          <button type="button" className="link" onClick={() => setAffected(affectedList.length === others.length ? new Set() : new Set(others))}>
            {affectedList.length === others.length ? "Ninguno" : "Todos"}
          </button>
        </div>
        <ul className="check-list">
          {others.map((id) => (
            <li key={id}><label><input type="checkbox" checked={affected.has(id)} onChange={() => toggle(id)} /><span>{label(id)}</span></label></li>
          ))}
          {others.length === 0 && <li className="muted">No hay más miembros en el grupo.</li>}
        </ul>
      </div>

      <label className="field">
        <span>Fecha</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>

      <label className={`switch-row ${aiReady ? "" : "disabled"}`}>
        <span>🤖 Puntuar con IA{aiHint && <small className="muted"><br />{aiHint}</small>}</span>
        <input type="checkbox" role="switch" checked={useAI && aiReady} disabled={!aiReady} onChange={(e) => setUseAI(e.target.checked)} />
      </label>

      {!(useAI && aiReady) && (
        <div className="field">
          <span>Puntuación manual</span>
          <div className="score-pick">
            <input type="range" min={-10} max={10} step={1} value={score} onChange={(e) => setScore(Number(e.target.value))} aria-label="Puntuación de -10 a +10" />
            <output className={score > 0 ? "score-pos" : score < 0 ? "score-neg" : ""}>{signed(score)}</output>
          </div>
        </div>
      )}
      {editing?.ai && useAI && aiReady && (
        <p className="muted"><small>Puntuación actual de la IA: <strong>{signed(editing.score)}</strong>. Solo se vuelve a puntuar si cambias el favor, quién lo hizo o a quién afecta.</small></p>
      )}

      {error && <p className="error">{error}</p>}
      <button disabled={busy}>{busy ? "🤖 Evaluando con IA…" : editing ? "Guardar cambios" : "Añadir favor"}</button>
      {editing && <button type="button" className="danger" disabled={busy} onClick={remove}>Eliminar favor</button>}
    </form>
  );
}
