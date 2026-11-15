import { pickRaffle, rankMembers } from "@coperoco/shared";
import { useMemo, useState } from "react";
import Modal from "../../components/Modal";
import type { LocalFavor, LocalMember } from "../../db";
import { BackIcon } from "../../components/icons";

interface Props {
  favors: LocalFavor[];
  members: LocalMember[];
  me: string;
  nameOf: (id: string) => string;
}

const MEDALS = ["🥇", "🥈", "🥉"];
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const cls = (n: number) => (n > 0 ? "score-pos" : n < 0 ? "score-neg" : "");

export default function RankingTab({ favors, members, me, nameOf }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const ranking = useMemo(() => {
    const ids = [...new Set([...members.map((m) => m.id), ...favors.map((f) => f.madeBy)])];
    return rankMembers(favors, ids);
  }, [favors, members]);
  const top = Math.max(1, ...ranking.map((r) => r.score));
  const who = (id: string) => `${nameOf(id)}${id === me ? " (tú)" : ""}`;

  // Los que ya no son miembros siguen en la clasificación pero no entran en el sorteo
  const active = new Set(members.map((m) => m.id));
  const raffleable = ranking.filter((r) => active.has(r.memberId));
  const raffle = () => { if (raffleable.length) setWinner(raffleable[pickRaffle(raffleable.map((r) => r.score), Math.random())]!.memberId); };

  // --- Detalle de una persona ---
  if (selected) {
    const mine = favors.filter((f) => f.madeBy === selected).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    const total = mine.reduce((s, f) => s + f.score, 0);
    return (
      <>
        <button className="link back-link" onClick={() => setSelected(null)}><BackIcon /> Clasificación</button>
        <h3 className="section-title">Favores de {who(selected)}</h3>
        <ul className="cards">
          {mine.map((f) => (
            <li key={f.id} className="fav-card static">
              <span className="fav-top"><span className="fav-desc">{f.description}</span><span className={`fav-score ${cls(f.score)}`}>{signed(f.score)}</span></span>
              {f.ai && f.aiComment && <span className="ai-note">🤖 {f.aiComment}</span>}
              <span className="fav-detail">{new Date(f.date + "T00:00:00").toLocaleDateString("es-ES")}{f.ai ? " · puntuado por IA" : ""}</span>
            </li>
          ))}
          {mine.length === 0 && <li className="muted">Aún no ha hecho ningún favor.</li>}
        </ul>
        <div className="card"><span className="muted">Puntuación total</span><strong className={`total-score ${cls(total)}`}>{signed(total)}</strong></div>
      </>
    );
  }

  return (
    <>
      <h3 className="section-title">Clasificación de amistad</h3>
      <ul className="cards">
        {ranking.map((r, i) => (
          <li key={r.memberId}>
            <button className="rank-card" onClick={() => setSelected(r.memberId)}>
              <span className="rank-medal">{MEDALS[i] ?? ""}</span>
              <span className="rank-main">
                <span className="rank-name">{who(r.memberId)}</span>
                {r.nickname && <span className="rank-nick">“{r.nickname}”</span>}
                <span className="rank-bar"><span style={{ width: `${Math.max(0, r.score) / top * 100}%` }} /></span>
              </span>
              <span className={`rank-score ${cls(r.score)}`}>{r.score}</span>
            </button>
          </li>
        ))}
        {ranking.length === 0 && <li className="muted">Aún no hay miembros cargados (necesitas conexión la primera vez).</li>}
      </ul>

      <div className="card" style={{ marginTop: "1rem" }}>
        <div className="row between" style={{ margin: 0 }}>
          <strong>¿Quién hace la próxima tarea?</strong>
          <button className="link" aria-label="Cómo funciona" onClick={() => setShowInfo(true)}>ℹ️</button>
        </div>
        <button className="wide" onClick={raffle} disabled={raffleable.length === 0}>🎲 Sortear</button>
      </div>

      <Modal open={winner !== null} onClose={() => setWinner(null)} title="Resultado del sorteo">
        <div className="center" style={{ padding: ".5rem 0" }}>
          <div className="winner-name">{winner && who(winner)}</div>
          <p className="muted">¡Te toca la próxima tarea!</p>
        </div>
        <button onClick={() => setWinner(null)}>Cerrar</button>
      </Modal>

      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="Cómo funciona el sorteo">
        <p style={{ margin: 0 }}>Sirve para repartir las tareas de forma justa según los favores de cada uno.</p>
        <p style={{ margin: 0 }}>Cuantos <strong>más puntos</strong> tienes, <strong className="score-neg">menos probabilidad</strong> de que te toque.</p>
        <p style={{ margin: 0 }}>Cuantos <strong>menos puntos</strong>, <strong className="score-pos">más probabilidad</strong>.</p>
        <p style={{ margin: 0 }}><strong>Nota:</strong> con 0 puntos o menos cuentas como si tuvieras 1.</p>
        <button onClick={() => setShowInfo(false)}>Entendido</button>
      </Modal>
    </>
  );
}
