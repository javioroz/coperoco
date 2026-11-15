import { computeBalances, minimalTransfers, type Transfer } from "@coperoco/shared";
import { useMemo, useState } from "react";
import type { LocalExpense, LocalMember } from "../../db";
import { eur } from "./format";

interface Props {
  expenses: LocalExpense[];
  members: LocalMember[];
  me: string;
  nameOf: (id: string) => string;
  onPay: (t: Transfer) => Promise<void>;
}

export default function BalancesTab({ expenses, members, me, nameOf, onPay }: Props) {
  const [showSettle, setShowSettle] = useState(false);
  const balances = useMemo(() => computeBalances(expenses), [expenses]);
  const transfers = useMemo(() => minimalTransfers(balances), [balances]);

  // Miembros actuales + cualquiera con saldo pendiente (ex-miembros que aún deben/se les debe)
  const ids = [...new Set([...members.map((m) => m.id), ...[...balances].filter(([, v]) => v !== 0).map(([id]) => id)])];
  const rows = ids.map((id) => ({ id, cents: balances.get(id) ?? 0 })).sort((a, b) => b.cents - a.cents);
  const settled = transfers.length === 0;
  const who = (id: string) => `${nameOf(id)}${id === me ? " (tú)" : ""}`;

  async function pay(t: Transfer) {
    if (!confirm(`¿Marcar como pagado: ${who(t.from)} → ${who(t.to)} (${eur(t.cents)})?\nSe registrará como un gasto de pago.`)) return;
    await onPay(t);
  }

  return (
    <>
      <h3 className="section-title">Saldos</h3>
      <ul className="cards">
        {rows.map((r) => (
          <li key={r.id} className="balance-row">
            <span className="balance-name">{who(r.id)}</span>
            <span className={`balance-amount ${r.cents > 0 ? "pos" : r.cents < 0 ? "neg" : ""}`}>
              {r.cents > 0 ? "+" : ""}{eur(r.cents)}
            </span>
            <span className="balance-hint">{r.cents > 0 ? "le deben" : r.cents < 0 ? "debe" : "al día"}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="muted">Aún no hay miembros cargados (necesitas conexión la primera vez).</li>}
      </ul>

      {settled ? (
        <p className="muted center">{expenses.length ? "Todo saldado ✅" : "Aún no hay gastos."}</p>
      ) : (
        <>
          <button className="wide" onClick={() => setShowSettle((v) => !v)}>
            {showSettle ? "Ocultar" : "Saldar deudas"}
          </button>
          {showSettle && (
            <div className="card settle-panel">
              <p className="muted" style={{ margin: 0 }}>
                <small>{transfers.length} {transfers.length === 1 ? "transferencia" : "transferencias"} (el mínimo posible)</small>
              </p>
              {transfers.map((t) => (
                <div key={`${t.from}-${t.to}`} className="transfer">
                  <span><strong>{who(t.from)}</strong> paga <strong>{eur(t.cents)}</strong> a <strong>{who(t.to)}</strong></span>
                  <button className="small" onClick={() => pay(t)}>Pagado</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
