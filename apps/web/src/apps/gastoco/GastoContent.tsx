import { computeBalances, SETTLEMENT_CATEGORY, type Transfer } from "@coperoco/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../../api";
import { useAuth } from "../../auth";
import { BalanceIcon, CardIcon, PieIcon, PlusIcon, SyncIcon } from "../../components/icons";
import { db, type LocalExpense } from "../../db";
import type { GroupContentProps } from "../registry";
import BalancesTab from "./BalancesTab";
import ExpenseModal from "./ExpenseModal";
import StatsTab from "./StatsTab";
import { dateLabel, eur, todayISO } from "./format";
import { addExpense, refreshMembers, syncExpenses } from "./sync";

/** Saldo del usuario en un grupo (tarjeta del listado), desde datos locales. */
export function GastoBadge({ groupId }: { groupId: string }) {
  const { session } = useAuth();
  const cents = useLiveQuery(async () => {
    const es = await db.expenses.where("groupId").equals(groupId).filter((e) => !e.deleted).toArray();
    return computeBalances(es).get(session!.user.id) ?? 0;
  }, [groupId]) ?? 0;
  return (
    <span className={`badge ${cents === 0 ? "zero" : cents < 0 ? "neg" : ""}`} aria-label={`Tu saldo: ${eur(cents)}`}>
      {cents > 0 ? "+" : ""}{eur(cents)}
    </span>
  );
}

type Tab = "expenses" | "balances" | "stats";

export default function GastoContent({ group, onGone }: GroupContentProps) {
  const id = group.id;
  const { session } = useAuth();
  const me = session!.user.id;

  const expenses = useLiveQuery(
    () => db.expenses.where("groupId").equals(id).filter((e) => !e.deleted).toArray()
      .then((a) => a.sort((x, y) => y.date.localeCompare(x.date) || y.createdAt - x.createdAt)),
    [id],
  );
  const memberRows = useLiveQuery(() => db.members.where("groupId").equals(id).toArray(), [id]);
  const pending = useLiveQuery(() => db.expenses.where("[groupId+dirty]").equals([id, 1]).count(), [id]);

  const [tab, setTab] = useState<Tab>("expenses");
  const [modal, setModal] = useState<"new" | LocalExpense | null>(null);
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
      await Promise.all([syncExpenses(id), refreshMembers(id)]);
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

  const pay = (t: Transfer) =>
    addExpense(id, {
      description: "Liquidación de deuda", amountCents: t.cents, paidBy: t.from, sharedBy: [t.to], category: SETTLEMENT_CATEGORY, date: todayISO(),
    }).then(() => { void sync(); });

  // Gastos agrupados por día (ya vienen ordenados)
  const byDay = useMemo(() => {
    const out: { date: string; items: LocalExpense[] }[] = [];
    for (const e of expenses ?? []) {
      if (out.at(-1)?.date === e.date) out.at(-1)!.items.push(e);
      else out.push({ date: e.date, items: [e] });
    }
    return out;
  }, [expenses]);

  const label = { idle: "Sincronizado", syncing: "Sincronizando…", offline: "Sin conexión", error: "Error al sincronizar" }[status];

  return (
    <>
      <div className="row between">
        <p className="muted">{label}{pending ? ` · ${pending} pendiente(s)` : ""}</p>
        <button className={`round-btn ${status === "syncing" ? "spin" : ""}`} onClick={sync} disabled={status === "syncing"}
          aria-label="Sincronizar" title="Sincronizar">
          <SyncIcon />
        </button>
      </div>

      {tab === "expenses" ? (
        <>
          {byDay.map((day) => (
            <section key={day.date}>
              <h3 className="section-title">{dateLabel(day.date)}</h3>
              <ul className="cards">
                {day.items.map((e) => (
                  <li key={e.id}>
                    <button className="expense-card" onClick={() => setModal(e)}>
                      <span className="group-emoji">{e.category || "💰"}</span>
                      <span className="exp-main">
                        <span className="exp-desc">{e.description}</span>
                        <span className="exp-detail">
                          Pagado por {nameOf(e.paidBy)}{e.paidBy === me ? " (tú)" : ""} · {e.sharedBy.length} {e.sharedBy.length === 1 ? "persona" : "personas"}
                        </span>
                      </span>
                      <span className="exp-amount">{eur(e.amountCents)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {expenses?.length === 0 && <p className="muted center">Aún no hay gastos. Pulsa + para añadir el primero.</p>}
        </>
      ) : tab === "balances" ? (
        <BalancesTab expenses={expenses ?? []} members={members} me={me} nameOf={nameOf} onPay={pay} />
      ) : (
        <StatsTab expenses={expenses ?? []} members={members} nameOf={nameOf} />
      )}

      <div className="tabbar-spacer" />

      {tab === "expenses" && (
        <button className="fab right" aria-label="Añadir gasto" onClick={() => setModal("new")}><PlusIcon /></button>
      )}

      <nav className="tabbar" aria-label="Secciones">
        <button className={tab === "expenses" ? "active" : ""} onClick={() => setTab("expenses")} aria-current={tab === "expenses"}>
          <CardIcon /><span>Gastos</span>
        </button>
        <button className={tab === "balances" ? "active" : ""} onClick={() => setTab("balances")} aria-current={tab === "balances"}>
          <BalanceIcon /><span>Saldos</span>
        </button>
        <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")} aria-current={tab === "stats"}>
          <PieIcon /><span>Estadísticas</span>
        </button>
      </nav>

      <ExpenseModal target={modal} groupId={id} me={me} members={members} nameOf={nameOf} onClose={() => setModal(null)} onSaved={() => void sync()} />
    </>
  );
}
