# CoPeroCo

Plataforma de pequeñas apps para compañeros de piso y amigos, con una misma cuenta, una misma
interfaz y un único frontend (PWA). Un usuario puede tener **varios grupos dentro de cada app**
(p.ej. 2 cestas en CestaCo, 1 grupo en GastoCo, 3 en FavorCo) y unirse a ellos por invitación.

| App | Estado |
|---|---|
| 🧺 **CestaCo** — lista de la compra compartida | funcional |
| 💸 **GastoCo** — gastos compartidos (estilo Splitwise/Tricount) | funcional |
| 🤝 **FavorCo** — favores entre amigos | esqueleto |
| ✈️ **ViajeCo** — planes de viaje en grupo | esqueleto |

## Estructura (npm workspaces)

| Paquete | Descripción |
|---|---|
| `apps/web` | React + Vite + PWA. Login, landing, y un módulo por app en `src/apps/<app>/`. Datos locales en IndexedDB (Dexie). |
| `apps/api` | Fastify + PostgreSQL. Una sola API/BD; cada grupo lleva una columna `app`. Migraciones en `apps/api/sql`. |
| `packages/shared` | Tipos y esquemas zod compartidos (`APP_IDS`, contrato de la API). |
| `deploy/` | Dockerfiles, Caddyfile (HTTPS automático) y compose de producción. |

## Añadir una app nueva

1. Añade su id a `APP_IDS` en `packages/shared/src/index.ts`.
2. Crea su módulo en `apps/web/src/apps/<id>/` con un componente de contenido de grupo.
3. Regístrala en `apps/web/src/apps/registry.tsx` (nombre, icono, color, vocabulario, emojis, `Content`).
   Listado de grupos, invitaciones, miembros, ajustes y tema de color vienen gratis.
4. Si necesita datos propios, añade tablas/rutas en la API (como hace CestaCo con `items`).

## GastoCo: cómo funciona

- Pestañas **Gastos** (lista local-first con botón de sincronizar, como CestaCo) y **Saldos**.
- Un gasto: descripción, importe, categoría, fecha, quién pagó y entre quiénes se reparte (a partes iguales).
- Todo se calcula en **céntimos enteros**; los céntimos sobrantes se reparten de forma determinista, así que
  todos los dispositivos calculan exactamente los mismos saldos.
- **Saldar deudas** propone el mínimo de transferencias: exacto (programación dinámica sobre subconjuntos) hasta
  18 personas con saldo; voraz a partir de ahí. "Pagado" registra la transferencia como un gasto de pago.
- La lógica está en `packages/shared/src/gastoco.ts` con tests: `npm test -w @coperoco/shared`.

## Desarrollo

```bash
cp .env.example .env
npm install
npm run db:up      # Postgres en docker
npm run dev        # API :3000 + web :5173 (proxy /api)
```

## CestaCo: cómo funciona el local-first

- La UI **solo lee/escribe en IndexedDB**; añadir/marcar/borrar items funciona sin conexión.
- Cada item lleva `dirty=1` hasta que el servidor lo confirma.
- Se sincroniza (`POST /api/groups/:id/sync`) al **abrir el grupo**, al **volver la conexión** y con el
  botón **Sincronizar**. Un sync envía los cambios locales y recibe los remotos en una sola petición.
- Conflictos: **last-write-wins** por `updatedAt` (reloj del cliente). Borrados lógicos (tombstones).
- El cursor es un `seq` de servidor por item; los sync de un mismo grupo se serializan con un
  advisory lock para que el cursor nunca se salte cambios.
- Crear grupo, invitar, unirse y salir **requieren conexión** (dependen de membresías en servidor).

## Despliegue en VPS

```bash
cp .env.example .env   # POSTGRES_PASSWORD y DOMAIN
docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d --build
```
Caddy sirve la web, proxya `/api` y gestiona el certificado (el DNS del dominio debe apuntar al VPS).

## Pendiente / ideas

- Iconos PNG 192/512 (ahora SVG) para mejor instalabilidad en Android/iOS.
- Rate limiting en `/auth/*`, limpieza de tombstones e invitaciones caducadas.
- UI para editar la cantidad de los items (el modelo y la API ya la soportan).
