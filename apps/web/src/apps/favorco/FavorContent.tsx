import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../../api";
import { useAuth } from "../../auth";
import { PlusIcon, StarIcon, SyncIcon, TrophyIcon } from "../../components/icons";
import { dateLabel } from "../../dates";
import { db, type LocalFavor } from "../../db";
import { refreshMembers } from "../../members";
import type { GroupContentProps } from "../registry";
import FavorModal from "./FavorModal";
import RankingTab from "./RankingTab";
import { syncFavors } from "./sync";

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const cls = (n: number) => (n > 0 ? "score-pos" : n < 0 ? "score-neg" : "");

/** Tu puntuación total en un grupo (tarjeta del listado), desde datos locales. */
export function FavorBadge({ groupId }: { groupId: string }) {
  const { session } = useAuth();
  const total = useLiveQuery(async () => {
    const fs = await db.favors.where("groupId").equals(groupId).filter((f) => !f.deleted && f.madeBy === session!.user.id).toArray();
    return fs.reduce((s, f) => s + f.score, 0);
  }, [groupId]) ?? 0;
  return <span className={`badge ${total === 0 ? "zero" : total < 0 ? "neg" : ""}`} aria-label={`Tu puntuación: ${total}`}>{signed(total)}</span>;
}

type Tab = "favors" | "ranking";

export default function FavorContent({ group, onGone }: GroupContentProps) {
  const id = group.id;
  const { session } = useAuth();
  const me = session!.user.id;

  const favors = useLiveQuery(
    () => db.favors.where("groupId").equals(id).filter((f) => !f.deleted).toArray()
      .then((a) => a.sort((x, y) => y.date.localeCompare(x.date) || y.createdAt - x.createdAt)),
    [id],
  );
  const memberRows = useLiveQuery(() => db.members.where("groupId").equals(id).toArray(), [id]);
  const pending = useLiveQuery(() => db.favors.where("[groupId+dirty]").equals([id, 1]).count(), [id]);

  const [tab, setTab] = useState<Tab>("favors");
  const [modal, setModal] = useState<"new" | LocalFavor | null>(null);
  const [status, setStatus] = useState<"idle" | "syncing" | "offline" | "error">("idle");

  const members = useMemo(() => (memberRows ?? []).filter((m) => m.active === 1), [memberRows]);
  const names = useMemo(() => {
    const m = new Map((memberRows ?? []).map((x) => [x.id, x.username]));
    if (!m.has(me)) m.set(me, session!.user.username);
    return m;
  }, [memberRows, me, session]);
  const nameOf = useCallback((uid: string) => names.get(uid) ?? "Ex-miembro", [names]);

  const sync = useCallback(async () => {
    setStatus("syncing");
    try {
      await Promise.all([syncFavors(id), refreshMembers(id)]);
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

  // Favores agrupados por día (ya vienen ordenados)
  const byDay = useMemo(() => {
    const out: { date: string; items: LocalFavor[] }[] = [];
    for (const f of favors ?? []) {
      if (out.at(-1)?.date === f.date) out.at(-1)!.items.push(f);
      else out.push({ date: f.date, items: [f] });
    }
    return out;
  }, [favors]);

  const label = { idle: "Sincronizado", syncing: "Sincronizando…", offline: "Sin conexión", error: "Error al sincronizar" }[status];

  return (
    <>
      <div className="row between">
        <p className="muted">{label}{pending ? ` · ${pending} pendiente(s)` : ""}</p>
        <button className={`round-btn ${status === "syncing" ? "spin" : ""}`} onClick={sync} disabled={status === "syncing"} aria-label="Sincronizar" title="Sincronizar">
          <SyncIcon />
        </button>
      </div>

      {tab === "favors" ? (
        <>
          {byDay.map((day) => (
            <section key={day.date}>
              <h3 className="section-title">{dateLabel(day.date)}</h3>
              <ul className="cards">
                {day.items.map((f) => (
                  <li key={f.id}>
                    <button className="fav-card" onClick={() => setModal(f)}>
                      <span className="fav-top">
                        <span className="fav-desc">🌟 {f.description}</span>
                        <span className={`fav-score ${cls(f.score)}`}>{signed(f.score)}</span>
                      </span>
                      <span className="fav-detail">
                        Hecho por {nameOf(f.madeBy)}{f.madeBy === me ? " (tú)" : ""}
                        {f.affected.length > 0 && ` · para ${f.affected.map(nameOf).join(", ")}`}
                      </span>
                      {f.ai && f.aiComment && <span className="ai-note">🤖 {f.aiComment}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {favors?.length === 0 && <p className="muted center">Aún no hay favores. Pulsa + para registrar el primero.</p>}
        </>
      ) : (
        <RankingTab favors={favors ?? []} members={members} me={me} nameOf={nameOf} />
      )}

      <div className="tabbar-spacer" />

      {tab === "favors" && <button className="fab right" aria-label="Añadir favor" onClick={() => setModal("new")}><PlusIcon /></button>}

      <nav className="tabbar" aria-label="Secciones">
        <button className={tab === "favors" ? "active" : ""} onClick={() => setTab("favors")} aria-current={tab === "favors"}><StarIcon /><span>Favores</span></button>
        <button className={tab === "ranking" ? "active" : ""} onClick={() => setTab("ranking")} aria-current={tab === "ranking"}><TrophyIcon /><span>Ranking</span></button>
      </nav>

      <FavorModal target={modal} groupId={id} me={me} members={members} nameOf={nameOf} onClose={() => setModal(null)} onSaved={() => void sync()} />
    </>
  );
}
