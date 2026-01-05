# herculito-push-api

API para habilitar notificaciones push en segundo plano (especialmente iOS) para el timer de descanso de la PWA Herculito.

## Contexto (por qué existe)

En iOS, una PWA no puede depender de `setInterval`/Web Workers para disparar una notificación cuando el teléfono está bloqueado o la app está en background, porque el sistema suspende la ejecución. La alternativa viable en web es Web Push: el backend espera `N` segundos y envía un push; el Service Worker lo muestra incluso con pantalla bloqueada.

Requisitos clave en iOS:
- iOS 16.4+.
- La PWA debe estar instalada en la pantalla de inicio ("Add to Home Screen").

## Estado actual

Implementado:
- Bun API con SQLite (persistencia) y scheduler interno.
- Validación de Firebase ID Token (Authorization Bearer) usando `jose` + JWKS remoto.
- VAPID configurado con `web-push`.
- Endpoints:
  - `GET /health`
  - `GET /v1/push/vapidPublicKey`
  - `POST /v1/push/subscribe`
  - `POST /v1/rest/schedule`
  - `POST /v1/rest/cancel`
- Dockerfile listo para despliegue.
- `.dockploy` básico para Dokploy.

Pendiente en el sistema completo (fuera de este repo):
- Integración en el SPA (suscripción Push desde la PWA, Service Worker con handler de `push`, y llamadas a schedule/cancel solo en iOS).
- Configurar DNS/Traefik/Dokploy para exponer esto como `https://api.herculito.exloz.site`.
- Generar y cargar variables VAPID en el entorno.
- Montar volumen persistente para la base SQLite.

## Variables de entorno

Obligatorias:
- `FIREBASE_PROJECT_ID`: Project ID de Firebase (aud/issuer para tokens).
- `VAPID_SUBJECT`: Ej. `mailto:tu@email.com`.
- `VAPID_PUBLIC_KEY`: clave pública VAPID.
- `VAPID_PRIVATE_KEY`: clave privada VAPID.

Opcionales:
- `PORT`: por defecto `3000`.
- `DATABASE_PATH`: por defecto `/data/push.sqlite`.
- `ALLOWED_ORIGINS`: lista separada por comas para CORS. Por defecto permite `https://herculito.exloz.site` y `localhost`.

## Generar VAPID keys

Con Bun (o Node):
- `bunx web-push generate-vapid-keys`

Guarda las claves en variables de entorno del deploy.

## API

### Autenticación

Todos los endpoints `POST` requieren header:
- `Authorization: Bearer <firebase-id-token>`

El token se obtiene desde el cliente con Firebase Auth (`currentUser.getIdToken()`).

### `POST /v1/push/subscribe`

Body:
- `deviceId`: string
- `subscription`: PushSubscription del navegador

Guarda/actualiza la subscription para `{ uid, deviceId }`.

### `POST /v1/rest/schedule`

Body:
- `deviceId`: string
- `seconds`: number (1..3600)
- `title`/`body`/`url` opcionales

Crea o reemplaza un job (uno por device) y agenda el push para `now + seconds`.

### `POST /v1/rest/cancel`

Body:
- `deviceId`: string

Cancela jobs pendientes para ese device.

## Cómo corre el scheduler

- La API guarda jobs en SQLite con `execute_at_ms`.
- Un loop interno revisa jobs vencidos y los envía vía Web Push.
- Si la instancia reinicia, los jobs pendientes siguen en SQLite.

## Deploy con Dokploy

- Desplegar como servicio separado.
- Exponer el puerto interno `3000`.
- Configurar host `api.herculito.exloz.site` hacia este servicio.
- Montar volumen persistente en `/data` para que `DATABASE_PATH=/data/push.sqlite` sobreviva reinicios.

## Limitaciones

- Si la PWA no está instalada en iOS, no hay push web confiable.
- El envío exacto al segundo no está garantizado (depende de red y políticas del sistema), pero para descansos cortos suele ser suficientemente bueno.
