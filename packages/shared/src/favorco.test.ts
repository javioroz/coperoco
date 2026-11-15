import assert from "node:assert/strict";
import { test } from "node:test";
import { pickRaffle, rankMembers, raffleWeights, type FavorLike } from "./favorco.js";

const f = (id: string, madeBy: string, score: number, date: string, extra: Partial<FavorLike> = {}): FavorLike => ({ id, madeBy, score, date, ...extra });

test("ranking: suma de puntos por quien hizo el favor, de más a menos", () => {
  const r = rankMembers([f("1", "A", 5, "2026-01-01"), f("2", "B", 9, "2026-01-02"), f("3", "A", 3, "2026-01-03")], ["A", "B", "C"]);
  assert.deepEqual(r.map((x) => [x.memberId, x.score, x.count]), [["B", 9, 1], ["A", 8, 2], ["C", 0, 0]]);
});

test("ranking: ignora borrados, admite puntos negativos y a quien ya no es miembro", () => {
  const r = rankMembers([f("1", "A", -4, "2026-01-01"), f("2", "A", 10, "2026-01-01", { deleted: true }), f("3", "X", 2, "2026-01-01")], ["A"]);
  assert.deepEqual(r.map((x) => [x.memberId, x.score]), [["X", 2], ["A", -4]]);
});

test("ranking: el mote es el del favor más reciente que lo tenga", () => {
  const r = rankMembers([
    f("1", "A", 1, "2026-01-01", { nickname: "El Novato" }),
    f("2", "A", 1, "2026-03-01", { nickname: "El Rey del Taladro" }),
    f("3", "A", 1, "2026-05-01"), // el más reciente no tiene mote: no pisa al anterior
  ], ["A"]);
  assert.equal(r[0]!.nickname, "El Rey del Taladro");
});

test("sorteo: más puntos = menos peso; ≤0 cuenta como 1", () => {
  const w = raffleWeights([10, 1, 0, -5]);
  assert.ok(w[0]! < w[1]!, "el que más puntos tiene pesa menos");
  assert.equal(w[1], w[2]);
  assert.equal(w[2], w[3]);
});

test("sorteo: una sola persona -> uniforme (siempre ella)", () => {
  assert.deepEqual(raffleWeights([7]), [1]);
  assert.equal(pickRaffle([7], 0.99), 0);
});

test("sorteo: pickRaffle respeta los pesos (distribución)", () => {
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const scores = [20, 2, 2]; // pesos: 4 vs 22 vs 22
  const hits = [0, 0, 0];
  for (let i = 0; i < 6000; i++) hits[pickRaffle(scores, rnd())]!++;
  assert.ok(hits[0]! < hits[1]! / 3, `el de 20 puntos sale mucho menos: ${hits}`);
  assert.ok(Math.abs(hits[1]! - hits[2]!) < 400, `los de 2 puntos, parecido: ${hits}`);
});

test("sorteo: los extremos de rand son válidos", () => {
  const i0 = pickRaffle([1, 1, 1], 0), i1 = pickRaffle([1, 1, 1], 0.999999);
  assert.ok(i0 >= 0 && i1 <= 2);
});
