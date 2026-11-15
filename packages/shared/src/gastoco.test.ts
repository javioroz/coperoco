import assert from "node:assert/strict";
import { test } from "node:test";
import { computeBalances, minimalTransfers, SETTLEMENT_CATEGORY, spendingByCategory, spendingByMember, splitCents, type ExpenseLike, type Transfer } from "./gastoco.js";

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
/** Aplica las transferencias a los saldos: todos deben quedar a 0. */
function settle(balances: Map<string, number>, ts: Transfer[]) {
  const b = new Map(balances);
  for (const t of ts) { b.set(t.from, (b.get(t.from) ?? 0) + t.cents); b.set(t.to, (b.get(t.to) ?? 0) - t.cents); }
  return [...b.values()].every((v) => v === 0);
}

test("splitCents reparte exactamente el total", () => {
  for (const total of [1, 2, 100, 1000, 9999, 123457]) {
    for (const n of [1, 2, 3, 7]) {
      const ids = Array.from({ length: n }, (_, i) => `u${i}`);
      const s = splitCents(total, ids, "x");
      assert.equal(sum(s), total);
      const vals = [...s.values()];
      assert.ok(Math.max(...vals) - Math.min(...vals) <= 1);
    }
  }
});

test("splitCents es determinista y deduplica", () => {
  assert.deepEqual([...splitCents(100, ["b", "a", "a"], "s")], [...splitCents(100, ["a", "b"], "s")]);
});

test("saldos: A paga 30 para A,B,C", () => {
  const e: ExpenseLike = { id: "e1", amountCents: 3000, paidBy: "A", sharedBy: ["A", "B", "C"] };
  const b = computeBalances([e]);
  assert.deepEqual([b.get("A"), b.get("B"), b.get("C")], [2000, -1000, -1000]);
});

test("saldos ignoran gastos borrados y suman 0", () => {
  const b = computeBalances([
    { id: "1", amountCents: 1001, paidBy: "A", sharedBy: ["A", "B", "C"] }, // 334 + 334 + 333
    { id: "2", amountCents: 5000, paidBy: "B", sharedBy: ["A"], deleted: true },
  ]);
  assert.equal(sum(b), 0);
  assert.ok([-334, -333].includes(b.get("B")!), `B=${b.get("B")}`); // el gasto borrado no cuenta
  assert.ok([-334, -333].includes(b.get("C")!));
});

test("sin deudas -> sin transferencias", () => {
  assert.deepEqual(minimalTransfers(new Map([["A", 0], ["B", 0]])), []);
  assert.deepEqual(minimalTransfers(new Map()), []);
});

test("caso simple: 1 transferencia", () => {
  const ts = minimalTransfers(new Map([["A", 500], ["B", -500]]));
  assert.deepEqual(ts, [{ from: "B", to: "A", cents: 500 }]);
});

test("óptimo: supera al voraz global (3 transferencias en vez de 4)", () => {
  // Subgrupos de suma 0: {A+6, B-3, C-3} (2 transferencias) y {D+5, E-5} (1). Un voraz global emparejaría
  // A con E y acabaría en 4.
  const b = new Map([["A", 600], ["B", -300], ["C", -300], ["D", 500], ["E", -500]]);
  const ts = minimalTransfers(b);
  assert.equal(ts.length, 3);
  assert.ok(settle(b, ts));
});

test("sin subgrupos propios: n-1 transferencias", () => {
  const b = new Map([["A", 500], ["B", 300], ["C", 200], ["D", -400], ["E", -600]]);
  const ts = minimalTransfers(b);
  assert.equal(ts.length, 4);
  assert.ok(settle(b, ts));
});

test("óptimo: encuentra subgrupos de suma 0 no obvios", () => {
  // {+6,-6} y {+4,+1,-5} -> 1 + 2 = 3 transferencias (n=5, n-1 sería 4)
  const b = new Map([["A", 600], ["B", -600], ["C", 400], ["D", 100], ["E", -500]]);
  const ts = minimalTransfers(b);
  assert.equal(ts.length, 3);
  assert.ok(settle(b, ts));
});

test("aleatorio: siempre salda y nunca supera n-1", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 200; t++) {
    const n = 2 + Math.floor(rnd() * 8);
    const ids = Array.from({ length: n }, (_, i) => `u${i}`);
    const expenses: ExpenseLike[] = Array.from({ length: 1 + Math.floor(rnd() * 12) }, (_, k) => {
      const shared = ids.filter(() => rnd() < 0.6);
      return { id: `e${t}-${k}`, amountCents: 1 + Math.floor(rnd() * 20000), paidBy: ids[Math.floor(rnd() * n)]!, sharedBy: shared.length ? shared : [ids[0]!] };
    });
    const b = computeBalances(expenses);
    assert.equal(sum(b), 0);
    const ts = minimalTransfers(b);
    assert.ok(settle(b, ts));
    assert.ok(ts.length <= Math.max(0, [...b.values()].filter((v) => v !== 0).length - 1));
  }
});

test("más de 18 personas usa el reparto voraz y también salda", () => {
  const b = new Map<string, number>();
  for (let i = 0; i < 20; i++) b.set(`p${String(i).padStart(2, "0")}`, i < 10 ? 100 + i : -(100 + (i - 10)));
  assert.equal(sum(b), 0);
  const ts = minimalTransfers(b);
  assert.ok(settle(b, ts));
  assert.ok(ts.length <= 19);
});

const sample: ExpenseLike[] = [
  { id: "1", amountCents: 3000, paidBy: "A", sharedBy: ["A", "B"], category: "🍔" },
  { id: "2", amountCents: 1000, paidBy: "B", sharedBy: ["A", "B"], category: "🍔" },
  { id: "3", amountCents: 5000, paidBy: "A", sharedBy: ["A", "B"], category: "🏠" },
  { id: "4", amountCents: 700, paidBy: "B", sharedBy: ["A"], category: "" },
  { id: "5", amountCents: 9999, paidBy: "B", sharedBy: ["A"], category: "🍔", deleted: true },
  { id: "6", amountCents: 2500, paidBy: "B", sharedBy: ["A"], category: SETTLEMENT_CATEGORY },
];

test("estadísticas: gasto por miembro = su parte de los repartos, sin borrados ni liquidaciones", () => {
  const m = spendingByMember(sample);
  // 1: 3000/2 -> A1500 B1500 | 2: 1000/2 -> 500 500 | 3: 5000/2 -> 2500 2500 | 4: 700 -> solo A | (5 borrado, 6 liquidación)
  assert.equal(m.get("A"), 1500 + 500 + 2500 + 700);
  assert.equal(m.get("B"), 1500 + 500 + 2500);
});

test("estadísticas: la suma de las partes es el gasto total (también con céntimos sobrantes)", () => {
  const es: ExpenseLike[] = [
    { id: "x", amountCents: 1001, paidBy: "A", sharedBy: ["A", "B", "C"], category: "🍕" },
    { id: "y", amountCents: 2, paidBy: "B", sharedBy: ["A", "B", "C"], category: "🍕" },
  ];
  assert.equal(sum(spendingByMember(es)), 1003);
});

test("estadísticas: por categoría ordenado de más a menos; sin categoría = 💰", () => {
  const c = spendingByCategory(sample);
  assert.deepEqual(c.map((x) => [x.category, x.cents, x.count]), [["🏠", 5000, 1], ["🍔", 4000, 2], ["💰", 700, 1]]);
});

test("estadísticas: las liquidaciones (💵, y 🔁 antiguo) no cuentan como gasto", () => {
  assert.equal(SETTLEMENT_CATEGORY, "💵");
  const es: ExpenseLike[] = [
    { id: "a", amountCents: 1000, paidBy: "A", sharedBy: ["A", "B"], category: "🍕" },
    { id: "b", amountCents: 5000, paidBy: "B", sharedBy: ["A"], category: "💵" },
    { id: "c", amountCents: 7000, paidBy: "B", sharedBy: ["A"], category: "🔁" },
  ];
  assert.equal(sum(spendingByMember(es)), 1000);
  assert.deepEqual(spendingByCategory(es).map((x) => x.category), ["🍕"]);
});

test("las liquidaciones sí cuentan para los saldos", () => {
  const b = computeBalances([{ id: "6", amountCents: 2500, paidBy: "B", sharedBy: ["A"], category: SETTLEMENT_CATEGORY }]);
  assert.equal(b.get("B"), 2500);
  assert.equal(b.get("A"), -2500);
});
