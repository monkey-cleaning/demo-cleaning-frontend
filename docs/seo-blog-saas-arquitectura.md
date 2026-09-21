# SEO Blog Platform → SaaS de blogs

Documento de arquitectura y checklist operativa.  
Última actualización: 2026-09-21

---

## 1. Modelo de negocio

### Antes
- Clientes fijos (Monkey, Iris, etc.).
- La plataforma genera blogs con IA y los publica sola en el sitio del cliente.
- Vínculo hardcodeado por nombre del cliente → env vars.

### Ahora (SaaS)
Vendemos la solución a otras empresas. Por cada cliente hay dos dimensiones:

| Concepto | Valores | Significado |
|----------|---------|-------------|
| **blog_mode** | `off` \| `manual` \| `auto` | Cómo se gestionan los posts |
| **publishing_status / auto_addon_status** | `active` \| `paused` \| `requested` | Si el extra de generación automática está activo |

- **auto** + **active**: la plataforma genera y publica sola (extra pago).
- **manual**: el cliente tiene un CRUD básico y sube posts a mano.
- **off**: no hay blog (rutas públicas 404 / noindex, admin 403).
- Si dejan de pagar el extra → `paused`: se deja de generar y de publicar. Los ya publicados: decisión de negocio (hoy se pueden despublicar vía draft sobre `external_id` existente).

---

## 2. Arquitectura por capas

```
seo-blog-platform (monolito)
  → genera / decide publicar
  → POST /api/internal/content/blogs  (ingest)
  → GET  /api/internal/content/status
  → PUT  /api/internal/content/addon

Sitio del cliente (ej. Demo Cleaning Co.)
  Backend: recibe, guarda, expone lectura + admin CRUD
  Frontend: /blog, /blog/:slug, SEO, site-config
```

### Tabla `clients` en seo-blog-platform (objetivo SaaS)

| Campo | Uso |
|-------|-----|
| `client_slug` | Identificador estable (reemplaza match por nombre) |
| `publish_url` | Endpoint ingest del sitio del cliente |
| `publish_token` | Token de servicio (cifrado; no solo env vars) |
| `public_site_url` | Base para armar `public_url` |
| `blog_mode` | `off` \| `manual` \| `auto` (o equivalente en plataforma) |
| `publishing_status` | `active` \| `paused` |

Hoy todavía existe el patrón legacy: `resolvePublishTarget(name)` busca `"monkey"` / `"iris"` y lee `MONKEY_*` / `IRIS_*`. Hay que migrar a los campos de arriba.

---

## 3. Contrato del backend del cliente (plantilla white-label)

Repo de referencia: **Demo Cleaning Co.** (front y back separados).  
Commits relevantes en el backend (main): migración entitlements, ingest, site-config, gates, admin settings.

### 3.1 Tabla `posts` / `blog_posts` (mínimo)

- `external_id` (unique) — id de la plataforma
- `slug` (unique)
- `title`
- `meta_description`
- `body_markdown`
- `keywords`
- `featured_image_url` / `featured_image_alt`
- `seo_score`
- `status` (`draft` \| `published` | …)
- `language`
- `published_at`
- `source` — `'seo-blog-platform'` \| `'admin'` \| `null` (null = manual legacy)

### 3.2 Endpoints internos (plataforma → cliente)

Auth: `Authorization: Bearer <SEO_BLOG_PLATFORM_SERVICE_TOKEN>`

| Método | Ruta | Rol |
|--------|------|-----|
| `POST` | `/api/internal/content/blogs` | Ingest / upsert por `external_id` |
| `GET` | `/api/internal/content/status` | `{ mode, entitled, auto_addon_status }` |
| `PUT` | `/api/internal/content/addon` | `{ auto_addon_status }` — única vía a `active` |

**Ingest**
- Siempre setea `source: 'seo-blog-platform'` (ignora `source` del payload).
- Respuesta esperada: `{ success, post_id, slug, public_url, action: "created" \| "updated" }`.
- Fuera de auto: solo se permite **update a draft** si ya existe `external_id`; create/publish → `409` con code `blog_auto_disabled` (o equivalente).

**Status / addon**
- `GET /status` alinea con el modo efectivo.
- `PUT /addon` activa/pausa el extra desde la plataforma.

### 3.3 Endpoints públicos

- Listado paginado y detalle por slug, solo `status = published`.
- Con blog apagado (`off`): **404** (y en front `noindex`).

### 3.4 Admin (CRUD modo manual)

- `GET/PUT /api/admin/settings/blog` — solo `blog_mode` en el PUT.
- CRUD de posts con auth de admin (JWT).
- Gates:
  - `off` → 403 `blog_disabled`
  - `auto` (gestionados por plataforma) → 403 `blog_managed_by_platform` (read-only en posts de plataforma; ocultar Edit/Delete).
- **Importante:** `GET /api/admin/blogs` y `GET /api/admin/blogs/:id` deben devolver el campo **`source`** (`'seo-blog-platform' | 'admin' | null`) para que el front marque “Sincronizado” y oculte edición en auto.

### 3.5 Site config (front)

```http
GET /api/site-config
→ { blogEnabled: boolean, blogMode: 'off' | 'manual' | 'auto' }
```

Alineado con el modo efectivo del admin.

### 3.6 Variables de entorno (cliente)

| Variable | Notas |
|----------|--------|
| `PUBLIC_SITE_URL` | Obligatoria en production |
| `SEO_BLOG_PLATFORM_SERVICE_TOKEN` | Ingest + status + addon |
| `SEO_BLOG_DEFAULT_AUTHOR` | Default neutro |
| `SEO_BLOG_ALLOWED_CLIENT_SLUGS` | Opcional |
| `SITE_SITEMAP_STATIC_ROUTES` | JSON; default `["/"]` |
| `BRAND_NAME` | Opcional |

Migración SQL de referencia: `db/migrations/20260921_site_settings_blog_mode.sql`  
Default neutro: `blog_mode = 'off'`.

Para poner una instancia en auto:

```sql
UPDATE site_settings
SET blog_mode = 'auto', auto_addon_status = 'active', updated_at = now()
WHERE id = 1;
```

### 3.7 Prueba mínima (curl)

```bash
# Status
curl -s $HOST/api/internal/content/status \
  -H "Authorization: Bearer $TOKEN"

# Activar addon
curl -s -X PUT $HOST/api/internal/content/addon \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"auto_addon_status":"active"}'

# Ingest
curl -s -X POST $HOST/api/internal/content/blogs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "external_id":"t1",
    "slug":"hello",
    "title":"Hi",
    "body_markdown":"## A\nx",
    "status":"published"
  }'

# Site config
curl -s $HOST/api/site-config
```

Ciclo de modos a validar:  
`off` (público 404, admin 403) → `manual` → `auto` sin addon (cae a manual) → addon `active` (ingest OK) → `paused` (draft sobre external_id despublica; create → 409).

---

## 4. Frontend del cliente (ajustes white-label)

### Site config
- **No** fail-open a `blogEnabled = true`.
- Guardar última respuesta válida en `localStorage` y usarla como estado inicial mientras se revalida.
- Si falla y no hay valor guardado → `blogEnabled = false` (sin error visible).
- `refresh()` con `cache: 'no-store'`.

### Rutas `/blog` y `/blog/:slug`
- Si `!ready` y no hay valor en caché → pantalla neutra (no blog ni 404 todavía).
- Si blog apagado → soft 404 + `<meta name="robots" content="noindex">`.

### API client
- `VITE_API_URL` **obligatoria** (fallar el build en producción si falta). Sin fallback silencioso a otro backend.

### 403 del backend
Parsear JSON: `{ error, code }` con códigos:
- `blog_disabled`
- `blog_managed_by_platform`

### Admin blogs
- Mostrar badge “Sincronizado” cuando `source === 'seo-blog-platform'`.
- En modo auto: ocultar Edit/Delete en posts de plataforma.
- Tipar `source` como opcional hasta que el backend lo devuelva siempre.

### White-label
Priorizar contenido de marca visible al visitante (ej. `TestimonialsSection` con reviews/URLs de Monkey). Lista de strings de marca para limpiar en PRs siguientes.

---

## 5. Checklist: cliente nuevo

### En el sitio del cliente (clonar plantilla Demo Cleaning Co.)
- [ ] Proyecto Supabase + migración `site_settings` / `blog_posts` (RLS revisado a mano: service role en backend; anon no debe escribir).
- [ ] Env: `PUBLIC_SITE_URL`, `SEO_BLOG_PLATFORM_SERVICE_TOKEN` (único por instancia), author, sitemap routes.
- [ ] Backend deployado con ingest, status, addon, site-config, admin settings/CRUD.
- [ ] Front: `VITE_API_URL`, SiteConfig context, rutas blog con SEO (metadata, schema Article, sitemap), gates off/manual/auto.
- [ ] Probar curls del §3.7 y ciclo de modos.
- [ ] Default `blog_mode = 'off'` hasta que contraten.

### En seo-blog-platform
- [ ] Alta del cliente en `clients` con `client_slug`, `publish_url`, `publish_token`, `public_site_url`.
- [ ] (Legacy temporal) o target en `publishTargets.ts` + env en Render si aún no migraron el resolver.
- [ ] Gate de publicación: no llamar al remoto si `publishing_status !== active` o `blog_mode !== auto`.
- [ ] Loguear `skipped` con motivo (paused / manual), no como error de red.
- [ ] `retry-publishes` no debe reintentar drafts de clientes pausados.
- [ ] Opcional: job de despublicar cuando pasan a paused (hoy: draft update sobre `external_id`).

### Decisión de negocio (definir y documentar)
- [ ] ¿Al pausar se dejan de **generar** borradores? (recomendado: sí, ahorra tokens/imágenes).
- [ ] ¿Los posts ya publicados quedan online o se bajan? (si se bajan, usar mecanismo de unpublish).

---

## 6. seo-blog-platform — trabajo pendiente

1. **Migrar targets a DB**  
   Dejar de depender de `resolvePublishTarget(name)` + env `MONKEY_*` / `IRIS_*`. Leer `publish_url` / `publish_token` / `client_slug` desde `clients`.

2. **Gate de pausa en los 4 puntos de entrada**
   - `POST /api/blogs/:id/publish`
   - generate-blog con `publish: true`
   - run-automation
   - retry-publishes

3. **Consultar status del cliente** antes de publicar  
   `GET {publish_url}/../status` (o ruta acordada) para respetar `mode` / `auto_addon_status` del sitio.

4. **Activar addon desde la plataforma**  
   `PUT .../addon` con `{ auto_addon_status: "active" }` cuando el cliente paga el extra.

5. **Despublicar al pausar** (si se define bajar posts)  
   Enviar update a `draft` por `external_id` o endpoint de unpublish si se agrega.

6. **Webhooks de pago** (Stripe / Mercado Pago) → actualizar `publishing_status` / disparar addon.

---

## 7. Orden de despliegue (plantilla / cliente)

1. Migración SQL en Supabase del cliente.
2. Deploy backend.
3. Config env + token de servicio.
4. Deploy frontend.
5. Probar status → addon active → ingest → site-config → rutas públicas.
6. Registrar cliente en seo-blog-platform y hacer un publish de prueba.

**Seguridad**
- Revisar RLS de `blog_posts` / `blog_sections` en el dashboard (el backend usa service role; la anon key no debe poder escribir).
- `SEO_BLOG_PLATFORM_SERVICE_TOKEN` solo en env del servidor (Render); uno distinto por instancia. Ese token también puede activar el addon: tratarlo como secreto de alto privilegio.

---

## 8. Resumen de contratos (copia rápida)

```
GET  /api/site-config
     → { blogEnabled, blogMode }

GET  /api/internal/content/status
     Auth: Bearer <service token>
     → { mode, entitled, auto_addon_status }

PUT  /api/internal/content/addon
     Auth: Bearer <service token>
     Body: { auto_addon_status: "active" | "paused" | ... }

POST /api/internal/content/blogs
     Auth: Bearer <service token>
     Body: { external_id, slug, title, body_markdown, status, ... }
     → { success, post_id, slug, public_url, action: "created"|"updated" }
     source siempre = 'seo-blog-platform'

GET  /api/admin/blogs  y  /api/admin/blogs/:id
     → incluir campo source
```

Códigos de error relevantes:
- `blog_disabled`
- `blog_managed_by_platform`
- `blog_auto_disabled` (o 409 al crear/publicar fuera de auto)

---

## 9. Próximo prompt sugerido (seo-blog-platform)

Cuando el backend del cliente esté desplegado y validado:

> Refactor de publicación para SaaS:
> 1. Extender `clients` con publish_url, publish_token (cifrado), public_site_url, client_slug, blog_mode/publishing_status.
> 2. resolvePublishTarget debe leer el cliente de DB; env solo como fallback temporal para Monkey/Iris.
> 3. Antes de cualquier publish remoto: consultar GET status del sitio; si no entitled/active o mode≠auto → skipped (no error).
> 4. Gate en: publish endpoint, generate-blog (publish:true), run-automation, retry-publishes.
> 5. Al activar el extra de un cliente: PUT addon active en su sitio.
> 6. (Opcional) Al pausar: unpublish vía draft update por external_id.
> 7. Tests/manual checklist con un cliente de staging que use el contrato del §3.

---

## 10. Estado actual (2026-09-21)

- Backend Demo Cleaning Co. (plantilla): migración + entitlements + ingest + site-config + gates + admin settings entregados en main (commits listados en historial del agente).
- Pendiente backend: confirmar `source` en listados admin; revisar RLS en Supabase; defaults neutros `off` en README (sin bloque específico Monkey).
- Frontend: aplicar ajustes de site-config, noindex, VITE_API_URL, parseo 403, badge source.
- seo-blog-platform: aún legacy por nombre/env; falta refactor a DB + gates de pausa/addon.

Con el contrato del §3 cerrado, cualquier cliente nuevo se arma clonando la plantilla, configurando env/token y registrándolo en la plataforma.
