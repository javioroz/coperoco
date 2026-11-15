// Un dominio con aspecto público que resuelve a una IP interna (SSRF por DNS) debe ser rechazado EN LA CONEXIÓN.
import assert from "node:assert/strict";
import dns from "node:dns";
import { test } from "node:test";
import { safePost } from "./netguard.js";

test("dominio que resuelve a IP interna -> la conexión se rechaza (no se llega a conectar)", async () => {
  const real = dns.lookup;
  const asked: string[] = [];
  (dns as any).lookup = (host: string, opts: any, cb: any) => {
    asked.push(host);
    const answers = { "evil.example.com": [{ address: "10.0.0.7", family: 4 }], "meta.example.com": [{ address: "169.254.169.254", family: 4 }], "v6.example.com": [{ address: "::1", family: 6 }], "mapped.example.com": [{ address: "::ffff:7f00:1", family: 6 }] }[host];
    return answers ? cb(null, answers) : real(host, opts, cb);
  };
  try {
    for (const h of ["evil.example.com", "meta.example.com", "v6.example.com", "mapped.example.com"]) {
      await assert.rejects(safePost(`https://${h}/v1/chat/completions`, {}, "{}", { timeoutMs: 2000 }), /IP interna/, h);
    }
    assert.deepEqual(asked.sort(), ["evil.example.com", "mapped.example.com", "meta.example.com", "v6.example.com"], "se resolvió cada nombre");
  } finally { (dns as any).lookup = real; }
});
