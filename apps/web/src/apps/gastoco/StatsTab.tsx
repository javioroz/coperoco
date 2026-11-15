import { spendingByCategory, spendingByMember } from "@coperoco/shared";
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { LocalExpense, LocalMember } from "../../db";
import { eur } from "./format";

interface Props {
  expenses: LocalExpense[];
  members: LocalMember[];
  nameOf: (id: string) => string;
}

const MAX_SLICES = 6; // más de 6 porciones no se leen: el resto se pliega en "Otros"
const pct = (f: number) => `${(f * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;

interface Slice { label: string; emoji?: string; cents: number; count: number; frac: number; color: string }
interface Tip { x: number; y: number; color: string; value: string; label: string }

const R = 90, C = 100;
const polar = (a: number, r = R): [number, number] => [C + r * Math.cos(a), C + r * Math.sin(a)];

export default function StatsTab({ expenses, members, nameOf }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [active, setActive] = useState<number | null>(null);

  const byCategory = useMemo(() => spendingByCategory(expenses), [expenses]);
  const byMember = useMemo(() => spendingByMember(expenses), [expenses]);
  const total = byCategory.reduce((s, c) => s + c.cents, 0);
  const count = byCategory.reduce((s, c) => s + c.count, 0);

  // --- Gasto por miembro (de más a menos) ---
  const people = useMemo(() => {
    const ids = new Set([...members.map((m) => m.id), ...byMember.keys()]);
    return [...ids]
      .map((id) => ({ id, name: nameOf(id), cents: byMember.get(id) ?? 0 }))
      .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
  }, [members, byMember, nameOf]);
  const maxPaid = Math.max(1, ...people.map((p) => p.cents));

  // --- Gasto por categoría: hasta 6 porciones, el resto plegado en "Otros" ---
  const slices: Slice[] = useMemo(() => {
    if (total === 0) return [];
    const folded = byCategory.length > MAX_SLICES;
    const shown = folded ? byCategory.slice(0, MAX_SLICES - 1) : byCategory;
    const out: Slice[] = shown.map((c, i) => ({
      label: c.category, emoji: c.category, cents: c.cents, count: c.count, frac: c.cents / total, color: `var(--series-${i + 1})`,
    }));
    if (folded) {
      const rest = byCategory.slice(MAX_SLICES - 1);
      const cents = rest.reduce((s, c) => s + c.cents, 0);
      out.push({ label: `Otros (${rest.length} categorías)`, cents, count: rest.reduce((s, c) => s + c.count, 0), frac: cents / total, color: "var(--series-other)" });
    }
    return out;
  }, [byCategory, total]);

  // Geometría de la tarta (empieza arriba, en sentido horario)
  const geo = useMemo(() => {
    let start = -Math.PI / 2;
    return slices.map((s) => {
      const sweep = s.frac * 2 * Math.PI;
      const end = start + sweep, mid = start + sweep / 2;
      const [x0, y0] = polar(start), [x1, y1] = polar(end);
      const d = `M${C} ${C} L${x0} ${y0} A${R} ${R} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x1} ${y1} Z`;
      start = end;
      return { d, mid, full: s.frac > 0.9999 };
    });
  }, [slices]);

  function show(at: { clientX: number; clientY: number }, t: Omit<Tip, "x" | "y">) {
    const r = wrap.current!.getBoundingClientRect();
    setTip({ ...t, x: Math.min(Math.max(at.clientX - r.left, 90), r.width - 90), y: at.clientY - r.top });
  }
  const showSlice = (at: { clientX: number; clientY: number }, i: number) => {
    const s = slices[i]!;
    setActive(i);
    show(at, { color: s.color, value: eur(s.cents), label: `${s.emoji ?? s.label} · ${pct(s.frac)} · ${s.count} ${s.count === 1 ? "gasto" : "gastos"}` });
  };
  const clear = () => { setTip(null); setActive(null); };
  const centerOf = (e: { currentTarget: Element }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  };

  if (total === 0) return <p className="muted center">Aún no hay gastos que mostrar.</p>;

  return (
    <div className="stats" ref={wrap} onPointerLeave={(e) => e.pointerType === "mouse" && clear()}
      onPointerDown={(e) => { if (!(e.target as Element).closest("[data-hit]")) clear(); }}>
      <div className="stat-hero">
        <span className="muted">Total gastado</span>
        <strong>{eur(total)}</strong>
        <span className="muted">{count} {count === 1 ? "gasto" : "gastos"}</span>
      </div>

      <h3 className="section-title">Gasto de cada miembro</h3>
      <ul className="bar-list">
        {people.map((p) => (
          <li key={p.id} className="bar-row" data-hit tabIndex={0}
            onPointerMove={(e) => show(e, { color: "var(--series-1)", value: eur(p.cents), label: `${p.name} · ${pct(p.cents / total)} del total` })}
            onFocus={(e) => show(centerOf(e), { color: "var(--series-1)", value: eur(p.cents), label: `${p.name} · ${pct(p.cents / total)} del total` })}
            onBlur={clear}>
            <span className="bar-name">{p.name}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `calc((100% - 5.75rem) * ${p.cents / maxPaid})` }} />
              <span className="bar-value">{eur(p.cents)}</span>
            </span>
          </li>
        ))}
      </ul>

      <h3 className="section-title">Gastado por categoría</h3>
      <svg className="pie" viewBox="0 0 200 200" role="img"
        aria-label={`Gasto por categoría: ${slices.map((s) => `${s.emoji ?? "Otros"} ${pct(s.frac)}`).join(", ")}`}>
        {slices.map((s, i) => {
          const g = geo[i]!;
          const lift = active === i ? 4 : 0; // la porción resaltada se separa un poco
          const transform = `translate(${Math.cos(g.mid) * lift}px, ${Math.sin(g.mid) * lift}px)`;
          const common = {
            className: "pie-slice", fill: s.color, "data-hit": true, tabIndex: 0,
            "aria-label": `${s.emoji ?? s.label}: ${eur(s.cents)}, ${pct(s.frac)}`,
            onPointerEnter: (e: RPointerEvent) => showSlice(e, i),
            onPointerMove: (e: RPointerEvent) => showSlice(e, i),
            onPointerDown: (e: RPointerEvent) => showSlice(e, i),
            onFocus: (e: React.FocusEvent<SVGElement>) => showSlice(centerOf(e), i),
            onBlur: clear,
          };
          return (
            <g key={s.label} style={{ transform, transition: "transform .12s" }}>
              {g.full ? <circle cx={C} cy={C} r={R} {...common} /> : <path d={g.d} {...common} />}
              {s.frac >= 0.09 && s.emoji && (
                <text x={polar(g.mid, R * 0.62)[0]} y={polar(g.mid, R * 0.62)[1]} className="pie-emoji" textAnchor="middle" dominantBaseline="central">{s.emoji}</text>
              )}
            </g>
          );
        })}
      </svg>

      <ul className="legend-list">
        {slices.map((s, i) => (
          <li key={s.label} className={active === i ? "on" : ""} onPointerEnter={(e) => e.pointerType === "mouse" && setActive(i)} onPointerLeave={() => setActive(null)}>
            <span className="swatch" style={{ background: s.color }} />
            <span className={`legend-label ${s.emoji ? "" : "text"}`}>{s.emoji ?? s.label}</span>
            <span className="legend-value">{eur(s.cents)}</span>
            <span className="legend-pct">{pct(s.frac)}</span>
          </li>
        ))}
      </ul>

      <details className="table-view">
        <summary>Ver como tabla</summary>
        <table>
          <thead><tr><th>Categoría</th><th>Importe</th><th>%</th><th>Gastos</th></tr></thead>
          <tbody>
            {byCategory.map((c) => (
              <tr key={c.category}><td>{c.category}</td><td>{eur(c.cents)}</td><td>{pct(c.cents / total)}</td><td>{c.count}</td></tr>
            ))}
          </tbody>
        </table>
      </details>

      {tip && (
        <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="status">
          <strong>{tip.value}</strong>
          <span><i className="tip-key" style={{ background: tip.color }} />{tip.label}</span>
        </div>
      )}
    </div>
  );
}
