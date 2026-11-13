import Fastify from "fastify";
import { ZodError } from "zod";
import { migrate } from "./db.js";
import { routes } from "./routes.js";

const app = Fastify({ logger: true });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) return reply.code(400).send({ error: "datos inválidos", details: err.issues });
  app.log.error(err);
  return reply.code(500).send({ error: "error interno" });
});

app.get("/api/health", async () => ({ ok: true }));
app.register(routes, { prefix: "/api" });

await migrate();
await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
