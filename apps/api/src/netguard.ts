import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * Salida HTTP segura hacia servidores que elige el usuario (el endpoint del LLM de un grupo).
 * Sin estas barreras sería un SSRF: cualquier miembro podría hacer que el servidor consulte la red interna
 * (base de datos, API, metadatos del proveedor cloud…). Se exige HTTPS en el puerto 443, se rechazan IPs privadas
 * y la comprobación se hace sobre la IP REAL a la que se conecta (a prueba de DNS rebinding). No se siguen redirecciones.
 *
 * LLM_ALLOW_PRIVATE=1 lo desactiva (modelos locales en tu red, p. ej. Ollama; y las pruebas). Por defecto, apagado.
 */
export const ALLOW_PRIVATE = process.env.LLM_ALLOW_PRIVATE === "1";

export class UnsafeUrlError extends Error {}

const blocked = new net.BlockList();
for (const [a, p] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(a, p, "ipv4");
for (const [a, p] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["2002::", 16], ["2001:db8::", 32], ["100::", 64],
] as const) blocked.addSubnet(a, p, "ipv6");

/** true si la dirección IP es pública (alcanzable en Internet y no interna). */
export function isPublicAddress(address: string): boolean {
  let addr = address.toLowerCase();
  let family = net.isIP(addr);
  if (!family) return false;
  // IPv4 mapeada en IPv6 (::ffff:10.0.0.1 o ::ffff:a00:1): se evalúa como IPv4
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(addr);
  if (dotted) { addr = dotted[1]!; family = 4; }
  else if (hex) { const hi = parseInt(hex[1]!, 16), lo = parseInt(hex[2]!, 16); addr = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`; family = 4; }
  return !blocked.check(addr, family === 4 ? "ipv4" : "ipv6");
}

/** Valida la forma de la URL (no resuelve DNS). Lanza UnsafeUrlError con un mensaje para el usuario. */
export function assertSafeUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new UnsafeUrlError("La dirección de la API no es válida"); }
  if (u.username || u.password) throw new UnsafeUrlError("La dirección no puede incluir usuario ni contraseña");
  if (!ALLOW_PRIVATE) {
    if (u.protocol !== "https:") throw new UnsafeUrlError("La API debe usar https://");
    if (u.port && u.port !== "443") throw new UnsafeUrlError("Solo se admite el puerto 443");
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && !isPublicAddress(host)) throw new UnsafeUrlError("No se permiten direcciones internas");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || (!host.includes(".") && !net.isIP(host)))
      throw new UnsafeUrlError("No se permiten direcciones internas");
  } else if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new UnsafeUrlError("Protocolo no admitido");
  }
  return u;
}

/** lookup que solo devuelve IPs públicas: la conexión se hace a una IP ya comprobada. */
function guardedLookup(hostname: string, options: dns.LookupOptions, callback: (...args: any[]) => void) {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return callback(err);
    const list = (addrs as dns.LookupAddress[]).filter((a) => ALLOW_PRIVATE || isPublicAddress(a.address));
    if (!list.length) return callback(new UnsafeUrlError("La dirección resuelve a una IP interna"));
    if (options.all) return callback(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
}

export interface SafeResponse { status: number; text: string }

/** POST seguro (JSON). Rechaza redirecciones, limita el tiempo y el tamaño de la respuesta. */
export function safePost(rawUrl: string, headers: Record<string, string>, body: string, opts: { timeoutMs?: number; maxBytes?: number } = {}): Promise<SafeResponse> {
  const { timeoutMs = 25_000, maxBytes = 256 * 1024 } = opts;
  const u = assertSafeUrl(rawUrl);
  const lib = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(u, {
      method: "POST",
      headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
      lookup: guardedLookup as any,
      timeout: timeoutMs,
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) { req.destroy(new Error("respuesta demasiado grande")); return; }
        chunks.push(c);
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(body);
  });
}
