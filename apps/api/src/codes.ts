import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I para que sea fácil de dictar

/** Código aleatorio. Grupos: 8 caracteres; invitaciones de plataforma: 10 (así nunca se confunden). */
export function newInviteCode(length = 8) {
  return Array.from(randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join("");
}
