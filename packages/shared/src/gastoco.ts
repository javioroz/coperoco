// Lógica de dominio de GastoCo. Todo en CÉNTIMOS (enteros) para evitar errores de coma flotante.

export interface ExpenseLike {
  id: string;
  amountCents: number;
  paidBy: string;
  sharedBy: string[];
  category?: string;
  deleted?: boolean;
}

/**
 * Categoría reservada de los pagos de liquidación ("Pagado" en Saldos). Es una transferencia entre
 * personas, no gasto real: cuenta para los saldos pero se excluye de las estadísticas.
 * No está en el selector de categorías, así que solo la llevan las liquidaciones.
 */
export const SETTLEMENT_CATEGORY = "💵";
const LEGACY_SETTLEMENT_CATEGORY = "🔁"; // usada brevemente antes; se sigue reconociendo
const isSettlement = (e: { category?: string }) => e.category === SETTLEMENT_CATEGORY || e.category === LEGACY_SETTLEMENT_CATEGORY;

export interface Transfer {
  from: string; // quien paga
  to: string; // quien recibe
  cents: number;
}

/** hash FNV-1a (determinista entre dispositivos) */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Reparte `total` céntimos a partes iguales. Los céntimos sobrantes se asignan de forma
 * determinista (según `seed`, normalmente el id del gasto) para que todos los dispositivos
 * calculen lo mismo y no siempre pague de más la misma persona.
 */
export function splitCents(total: number, ids: string[], seed = ""): Map<string, number> {
  const sorted = [...new Set(ids)].sort();
  const n = sorted.length;
  if (n === 0) return new Map();
  const base = Math.floor(total / n);
  const rem = total - base * n;
  const offset = hash(seed) % n;
  return new Map(sorted.map((id, i) => [id, base + ((i - offset + n) % n < rem ? 1 : 0)]));
}

/** Saldo por persona en céntimos. Positivo = le deben; negativo = debe. La suma es siempre 0. */
export function computeBalances(expenses: ExpenseLike[]): Map<string, number> {
  const balances = new Map<string, number>();
  const add = (id: string, v: number) => balances.set(id, (balances.get(id) ?? 0) + v);
  for (const e of expenses) {
    if (e.deleted) continue;
    add(e.paidBy, e.amountCents);
    for (const [id, share] of splitCents(e.amountCents, e.sharedBy, e.id)) add(id, -share);
  }
  return balances;
}

const MAX_EXACT = 18; // 2^18 subconjuntos: instantáneo

type Person = { id: string; v: number };

/**
 * Mínimo número de transferencias para dejar todos los saldos a 0.
 * Mínimo = (personas con saldo ≠ 0) − (máximo nº de subgrupos disjuntos cuya suma es 0), y dentro
 * de cada subgrupo bastan (tamaño − 1) transferencias. Se resuelve de forma exacta por programación
 * dinámica sobre subconjuntos (hasta MAX_EXACT personas con saldo); si hay más, se usa un reparto
 * voraz (máximo acreedor ↔ máximo deudor), que da como mucho n − 1 transferencias.
 */
export function minimalTransfers(balances: Map<string, number>): Transfer[] {
  const people: Person[] = [...balances]
    .filter(([, v]) => v !== 0)
    .map(([id, v]) => ({ id, v }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (people.length === 0) return [];
  const groups = people.length <= MAX_EXACT ? partitionZeroSum(people) : [people];
  return groups.flatMap(settleGroup);
}

function partitionZeroSum(people: Person[]): Person[][] {
  const n = people.length;
  const size = 1 << n;
  const sum = new Float64Array(size);
  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask;
    sum[mask] = sum[mask ^ low]! + people[31 - Math.clz32(low)]!.v;
  }
  // dp[mask] = máx. nº de prefijos de suma 0 en cualquier ordenación de `mask`
  const dp = new Int8Array(size);
  for (let mask = 1; mask < size; mask++) {
    let best = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) best = Math.max(best, dp[mask ^ (1 << i)]!);
    dp[mask] = best + (sum[mask] === 0 ? 1 : 0);
  }
  // Reconstrucción: ordenación óptima -> cortes en los prefijos de suma 0
  const order: number[] = [];
  let mask = size - 1;
  while (mask) {
    const z = sum[mask] === 0 ? 1 : 0;
    let pick = -1;
    for (let i = 0; i < n; i++) if (mask & (1 << i) && dp[mask ^ (1 << i)]! + z === dp[mask]) { pick = i; break; }
    order.push(pick);
    mask ^= 1 << pick;
  }
  order.reverse();
  const groups: Person[][] = [];
  let cur: Person[] = [], run = 0;
  for (const i of order) {
    cur.push(people[i]!);
    run += people[i]!.v;
    if (run === 0) { groups.push(cur); cur = []; }
  }
  return groups;
}

/** Voraz dentro de un grupo de suma 0: el que más debe paga al que más se le debe. */
function settleGroup(group: Person[]): Transfer[] {
  const debtors = group.filter((p) => p.v < 0).map((p) => ({ id: p.id, v: -p.v })).sort((a, b) => b.v - a.v);
  const creditors = group.filter((p) => p.v > 0).map((p) => ({ ...p })).sort((a, b) => b.v - a.v);
  const out: Transfer[] = [];
  let d = 0, c = 0;
  while (d < debtors.length && c < creditors.length) {
    const cents = Math.min(debtors[d]!.v, creditors[c]!.v);
    out.push({ from: debtors[d]!.id, to: creditors[c]!.id, cents });
    debtors[d]!.v -= cents;
    creditors[c]!.v -= cents;
    if (debtors[d]!.v === 0) d++;
    if (creditors[c]!.v === 0) c++;
  }
  return out;
}

// ---------- Estadísticas ----------
const isSpending = (e: ExpenseLike) => !e.deleted && !isSettlement(e);

/**
 * Gasto que le corresponde a cada persona (céntimos): la suma de su parte en cada reparto, con el mismo
 * reparto exacto que los saldos. Sin liquidaciones. La suma de todos es el gasto total.
 */
export function spendingByMember(expenses: ExpenseLike[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of expenses) {
    if (!isSpending(e)) continue;
    for (const [id, share] of splitCents(e.amountCents, e.sharedBy, e.id)) out.set(id, (out.get(id) ?? 0) + share);
  }
  return out;
}

export interface CategorySpend {
  category: string;
  cents: number;
  count: number;
}

/** Gasto total por categoría (emoji), de más a menos; sin liquidaciones. Sin categoría = "💰". */
export function spendingByCategory(expenses: ExpenseLike[], fallback = "💰"): CategorySpend[] {
  const map = new Map<string, CategorySpend>();
  for (const e of expenses) {
    if (!isSpending(e)) continue;
    const category = e.category || fallback;
    const cur = map.get(category) ?? { category, cents: 0, count: 0 };
    cur.cents += e.amountCents;
    cur.count++;
    map.set(category, cur);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents || (a.category < b.category ? -1 : 1));
}
