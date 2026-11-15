// Crea una invitación de plataforma desde el servidor (necesaria para el PRIMER usuario).
//   desarrollo: npm run invite -w @coperoco/api [días]
//   producción: dc exec api npm run invite [días]
import { newInviteCode } from "../codes.js";
import { pool, waitForDb } from "../db.js";

const days = Number(process.argv[2] ?? 7);
if (!Number.isInteger(days) || days < 1 || days > 365) {
  console.error("Uso: npm run invite [días de validez, 1-365]");
  process.exit(1);
}

await waitForDb();
const code = newInviteCode(10);
await pool.query("INSERT INTO signup_invites (code, created_by, expires_at) VALUES ($1, NULL, now() + make_interval(days => $2::int))", [code, days]);
await pool.end();

console.log(`\nInvitación creada (válida ${days} ${days === 1 ? "día" : "días"}, un solo uso):\n`);
console.log(`  código: ${code}`);
console.log(`  enlace: ${process.env.DOMAIN ? `https://${process.env.DOMAIN}` : "http://localhost:5173"}/invite/${code}\n`);
