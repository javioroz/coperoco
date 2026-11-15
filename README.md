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

## Cuentas: registro solo por invitación

No se puede crear una cuenta sin un código de invitación. Hay dos tipos, ambos válidos al registrarse:

- **Invitación de plataforma**: la crea cualquier usuario desde el menú de usuario → *Invitar a CoPeroCo*. Un solo uso,
  caduca a los 7 días, máximo 5 sin usar a la vez. Se guarda quién invitó a cada usuario (`users.invited_by`).
- **Enlace de invitación a un grupo** (`/join/CÓDIGO`): quien no tiene cuenta se registra con él y entra directamente al grupo.

Los enlaces `/invite/CÓDIGO` (plataforma) y `/join/CÓDIGO` (grupo) abren el registro con el código ya puesto.

### El primer usuario

Para él no hay nadie que invite, así que su código se crea desde el servidor:

```bash
dc exec api npm run invite          # en producción
npm run invite -w @coperoco/api     # en desarrollo
```

Imprime el código (10 caracteres, un solo uso, 7 días) y el enlace `https://TU_DOMINIO/invite/CÓDIGO`. Se puede pasar
el número de días de validez como argumento (`npm run invite 30`). El mismo comando sirve en cualquier momento para
recuperar el acceso a la plataforma si nadie tiene invitaciones disponibles.

`dc` es un alias de `docker compose -f deploy/docker-compose.prod.yml --env-file .env` (ver *Despliegue en VPS*).

### Límites

Intentos por IP (en memoria, se reinician con la API): 10 logins cada 15 min y 10 registros por hora.
La API confía en `X-Forwarded-For` (`trustProxy`), por lo que **solo debe ser accesible a través de Caddy**
(así es en `deploy/docker-compose.prod.yml`: la API no publica puertos).

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

Requisitos: un VPS con Docker, un dominio con un registro `A` apuntando a su IP y los puertos 80 y 443 abiertos.

```bash
git clone https://github.com/javioroz/coperoco.git && cd coperoco
cp .env.example .env
# edita .env: POSTGRES_PASSWORD (genérala con `openssl rand -hex 24`; sin / + = que romperían la URL) y DOMAIN
chmod 600 .env

# alias práctico (añádelo a ~/.bashrc para que persista)
alias dc='docker compose -f ~/coperoco/deploy/docker-compose.prod.yml --env-file ~/coperoco/.env'

dc up -d --build          # construye y arranca db, api y web (Caddy)
dc ps                     # los tres deben estar "Up"
dc logs --tail 40 api     # deben verse las migraciones aplicadas
curl -s https://TU_DOMINIO/api/health     # {"ok":true}
```

Caddy sirve la web, proxya `/api` y gestiona el certificado HTTPS. Solo se publican los puertos 80 y 443:
la base de datos y la API no son accesibles desde Internet.

**Después del primer despliegue, crea tu invitación** (el registro está cerrado hasta que exista una) y regístrate con el enlace:

```bash
dc exec api npm run invite
```

**Actualizar:** `cd ~/coperoco && git pull && dc up -d --build` (las migraciones se aplican solas al arrancar la API).

**Copia de seguridad** (los datos solo existen en el volumen de Postgres del servidor):

```bash
dc exec -T db pg_dump -U coperoco coperoco | gzip > ~/backups/db-$(date +%F).sql.gz
gunzip -c ~/backups/db-FECHA.sql.gz | dc exec -T db psql -U coperoco coperoco     # restaurar
```

## Pendiente / ideas

- Iconos PNG 192/512 (ahora SVG) para mejor instalabilidad en Android/iOS.
- Caducidad de sesiones y recuperación de contraseña.
- Programar la copia de seguridad diaria (cron) y copiarla fuera del servidor.
- Limpieza de marcas de borrado (items/gastos) e invitaciones caducadas.
- FavorCo y ViajeCo: solo tienen el esqueleto (grupos, invitaciones, miembros).
