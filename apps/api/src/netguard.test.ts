import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSafeUrl, isPublicAddress, UnsafeUrlError } from "./netguard.js";
import { decryptSecret, encryptSecret } from "./secrets.js";

test("isPublicAddress: públicas", () => {
  for (const a of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"]) assert.equal(isPublicAddress(a), true, a);
});

test("isPublicAddress: internas, loopback, link-local (metadatos cloud), CGNAT…", () => {
  for (const a of ["127.0.0.1", "127.8.9.10", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1"]) assert.equal(isPublicAddress(a), false, a);
});

test("isPublicAddress: IPv4 camuflada en IPv6 (::ffff:…) se evalúa como IPv4", () => {
  assert.equal(isPublicAddress("::ffff:127.0.0.1"), false);
  assert.equal(isPublicAddress("::ffff:7f00:1"), false);        // 127.0.0.1 en hexadecimal
  assert.equal(isPublicAddress("::ffff:a9fe:a9fe"), false);     // 169.254.169.254
  assert.equal(isPublicAddress("::ffff:10.0.0.1"), false);
  assert.equal(isPublicAddress("::ffff:8.8.8.8"), true);
});

test("isPublicAddress: lo que no es una IP no es público", () => {
  for (const a of ["localhost", "", "999.1.1.1", "api.openai.com"]) assert.equal(isPublicAddress(a), false, a);
});

test("assertSafeUrl: acepta una API pública por https", () => {
  assert.equal(assertSafeUrl("https://api.openai.com/v1/chat/completions").hostname, "api.openai.com");
  assert.equal(assertSafeUrl("https://openrouter.ai:443/api/v1/chat/completions").hostname, "openrouter.ai");
});

test("assertSafeUrl: rechaza http, puertos raros, credenciales, internas y basura", () => {
  for (const u of [
    "http://api.openai.com/v1", "https://api.openai.com:8443/v1", "https://user:pw@api.openai.com/", "ftp://api.openai.com",
    "https://127.0.0.1/x", "https://localhost/x", "https://sub.localhost/x", "https://db/x", "https://api:3000/x", "https://metadata.internal/x",
    "https://169.254.169.254/latest/meta-data", "https://10.0.0.5/", "https://[::1]/", "https://[::ffff:7f00:1]/", "no es una url", "",
  ]) assert.throws(() => assertSafeUrl(u), UnsafeUrlError, u);
});

test("secretos: cifrado de ida y vuelta, aleatorio y a prueba de manipulación", () => {
  const a = encryptSecret("sk-clave-super-secreta"), b = encryptSecret("sk-clave-super-secreta");
  assert.notEqual(a, b, "IV aleatorio: dos cifrados del mismo texto difieren");
  assert.ok(!a.includes("secreta"));
  assert.equal(decryptSecret(a), "sk-clave-super-secreta");
  const parts = a.split(".");
  assert.equal(decryptSecret([parts[0], parts[1], parts[2], Buffer.from("otra cosa").toString("base64")].join(".")), null, "dato manipulado");
  assert.equal(decryptSecret("basura"), null);
});

test("secretos: con otra SECRETS_KEY no se puede descifrar", () => {
  const prev = process.env.SECRETS_KEY;
  process.env.SECRETS_KEY = "a".repeat(32);
  const t = encryptSecret("clave");
  process.env.SECRETS_KEY = "b".repeat(32);
  assert.equal(decryptSecret(t), null);
  process.env.SECRETS_KEY = "a".repeat(32);
  assert.equal(decryptSecret(t), "clave");
  if (prev === undefined) delete process.env.SECRETS_KEY; else process.env.SECRETS_KEY = prev;
});
