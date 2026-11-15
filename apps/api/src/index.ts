import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { ZodError } from "zod";
import { migrate } from "./db.js";
import { routes } from "./routes.js";

// trustProxy: la API solo es accesible a través de Caddy, que fija X-Forwarded-For con la IP real del cliente.
// Sin esto, el límite de intentos vería siempre la IP de Caddy y bloquearía a todos a la vez.
const app = Fastify({ logger: true, trustProxy: true });

await app.register(rateLimit, {
  global: false, // se activa por ruta (login, registro)
  errorResponseBuilder: (_req, ctx) => ({
    statusCode: 429,
    error: "Too Many Requests",
    message: `Demasiados intentos. Inténtalo de nuevo en ${Math.max(1, Math.ceil(ctx.ttl / 60000))} min.`,
  }),
});

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) return reply.code(400).send({ error: "datos inválidos", details: err.issues });
  const status = (err as { statusCode?: number }).statusCode;
  if (status && status >= 400 && status < 500) return reply.code(status).send({ error: (err as Error).message }); // 429, JSON mal formado…
  app.log.error(err);
  return reply.code(500).send({ error: "error interno" });
});

app.get("/api/health", async () => ({ ok: true }));
app.register(routes, { prefix: "/api" });

await migrate();
await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
