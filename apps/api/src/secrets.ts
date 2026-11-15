import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Cifrado de secretos en reposo (claves de API de los grupos). AES-256-GCM con SECRETS_KEY.
// En producción SECRETS_KEY es obligatoria; en desarrollo se usa una clave fija (solo para pruebas locales).
function key(): Buffer | null {
  const raw = process.env.SECRETS_KEY ?? "";
  if (raw.length >= 16) return createHash("sha256").update(raw).digest();
  if (process.env.NODE_ENV !== "production") return createHash("sha256").update("coperoco-dev-only-secrets-key").digest();
  return null;
}

export const secretsAvailable = () => key() !== null;

export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) throw new Error("SECRETS_KEY no configurada");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(".");
}

/** Devuelve null si no se puede descifrar (clave distinta, dato corrupto). */
export function decryptSecret(token: string): string | null {
  const k = key();
  const [v, iv, tag, ct] = token.split(".");
  if (!k || v !== "v1" || !iv || !tag || !ct) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
