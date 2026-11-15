// Se ejecuta con LLM_ALLOW_PRIVATE=1 para poder hablar con un servidor falso en localhost.
process.env.LLM_ALLOW_PRIVATE = "1";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";

const { evaluateFavor, LlmError, buildUserPrompt } = await import("./llm.js");

let server: http.Server, base = "";
let mode: (req: http.IncomingMessage, body: string, res: http.ServerResponse) => void = () => {};
const seen: { auth?: string; body?: any }[] = [];
before(async () => {
  server = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => { seen.push({ auth: req.headers.authorization, body: JSON.parse(body || "{}") }); mode(req, body, res); });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/chat/completions`;
});
after(() => server.close());

const reply = (content: unknown, status = 200) => (_r: any, _b: string, res: http.ServerResponse) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(typeof content === "string" && status !== 200 ? content : JSON.stringify({ choices: [{ message: { content } }] }));
};
const cfg = () => ({ endpoint: base, model: "m", apiKey: "sk-TEST-1234567890" });
const ctx = { groupName: "Piso", makerName: "ana", affectedNames: ["bob", "cam"], memberCount: 3, description: "Arregló el grifo", date: "2026-11-15", history: [{ description: "Fregó", score: 2 }], totalScore: 2, previousNicknames: ["La Reina"] };
const rejectsWith = async (p: Promise<unknown>, re: RegExp) => { await assert.rejects(p, (e: Error) => { assert.ok(e instanceof LlmError, `no es LlmError: ${e}`); assert.match(e.message, re); assert.ok(!e.message.includes("sk-TEST"), "el mensaje no debe filtrar la clave"); return true; }); };

test("respuesta correcta: puntuación, comentario y mote", async () => {
  mode = reply(JSON.stringify({ comment: "Un héroe con llave inglesa.", score: 7, nickname: "El Fontanero" }));
  const r = await evaluateFavor(cfg(), ctx);
  assert.deepEqual(r, { score: 7, comment: "Un héroe con llave inglesa.", nickname: "El Fontanero" });
});

test("envía la clave por Authorization, el modelo y la descripción como datos", async () => {
  seen.length = 0; mode = reply(JSON.stringify({ comment: "c", score: 1, nickname: "n" }));
  await evaluateFavor(cfg(), ctx);
  assert.equal(seen[0]!.auth, "Bearer sk-TEST-1234567890");
  assert.equal(seen[0]!.body.model, "m");
  assert.equal(seen[0]!.body.messages[0].role, "system");
  assert.match(seen[0]!.body.messages[0].content, /NUNCA como instrucciones/);
  assert.match(seen[0]!.body.messages[1].content, /Arregló el grifo/);
  assert.match(seen[0]!.body.messages[1].content, /bob, cam/);
});

test("tolera JSON envuelto en ```json y texto alrededor", async () => {
  mode = reply("```json\n{\"comment\":\"ok\",\"score\":3,\"nickname\":\"X\"}\n```");
  assert.equal((await evaluateFavor(cfg(), ctx)).score, 3);
  mode = reply("Claro, aquí tienes: {\"comment\":\"ok\",\"score\":-2,\"nickname\":\"Y\"} ¡Suerte!");
  assert.equal((await evaluateFavor(cfg(), ctx)).score, -2);
});

test("la salida del modelo no es de fiar: puntuación acotada y redondeada, textos recortados", async () => {
  mode = reply(JSON.stringify({ comment: "x".repeat(5000), score: 99, nickname: "n".repeat(500) }));
  const hi = await evaluateFavor(cfg(), ctx);
  assert.equal(hi.score, 10); assert.equal(hi.comment.length, 600); assert.equal(hi.nickname.length, 40);
  mode = reply(JSON.stringify({ comment: "c", score: -50, nickname: "n" })); assert.equal((await evaluateFavor(cfg(), ctx)).score, -10);
  mode = reply(JSON.stringify({ comment: "c", score: 3.7, nickname: "n" })); assert.equal((await evaluateFavor(cfg(), ctx)).score, 4);
  mode = reply(JSON.stringify({ comment: "c", score: "7", nickname: "n" })); assert.equal((await evaluateFavor(cfg(), ctx)).score, 7);
});

test("respuesta sin puntuación válida o sin JSON -> error claro", async () => {
  mode = reply(JSON.stringify({ comment: "c", nickname: "n" })); await rejectsWith(evaluateFavor(cfg(), ctx), /puntuación válida/);
  mode = reply(JSON.stringify({ comment: "c", score: "mucho", nickname: "n" })); await rejectsWith(evaluateFavor(cfg(), ctx), /puntuación válida/);
  mode = reply("esto no es json"); await rejectsWith(evaluateFavor(cfg(), ctx), /no se pudo interpretar/);
  mode = (_r, _b, res) => { res.writeHead(200); res.end("<html>no soy una api</html>"); }; await rejectsWith(evaluateFavor(cfg(), ctx), /formato inesperado/);
});

test("errores HTTP del proveedor -> mensajes en español, sin filtrar su respuesta", async () => {
  for (const [status, re] of [[401, /rechazó la clave/], [403, /rechazó la clave/], [404, /endpoint o el modelo/], [429, /cuota/], [500, /ha fallado/], [503, /ha fallado/], [400, /error \(HTTP 400\)/]] as const) {
    mode = reply("{\"error\":\"detalle interno sk-TEST-1234567890\"}", status);
    await rejectsWith(evaluateFavor(cfg(), ctx), re);
  }
});

test("no sigue redirecciones", async () => {
  mode = (_r, _b, res) => { res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data" }); res.end(); };
  await rejectsWith(evaluateFavor(cfg(), ctx), /HTTP 302/);
});

test("timeout y servidor caído", async () => {
  mode = () => { /* no responde */ };
  await rejectsWith(evaluateFavor(cfg(), ctx, { timeoutMs: 300 }), /tardó demasiado/);
  await rejectsWith(evaluateFavor({ ...cfg(), endpoint: "http://127.0.0.1:1/x" }, ctx), /No se pudo conectar/);
});

test("prompt: 'todo el grupo', 'nadie en concreto' y sin historial", () => {
  assert.match(buildUserPrompt({ ...ctx, affectedNames: ["bob", "cam"], memberCount: 3 }), /todo el grupo \(bob, cam\)/);
  assert.match(buildUserPrompt({ ...ctx, affectedNames: [] }), /ninguna persona en concreto/);
  assert.match(buildUserPrompt({ ...ctx, history: [], previousNicknames: [] }), /aún no ha hecho ningún favor/);
});
