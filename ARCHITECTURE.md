# Arquitectura del Proyecto - Herculito Push API

## Resumen

API REST construida con **Bun** y **SQLite** para gestionar notificaciones push Web, timer de descanso y persistencia de datos de workouts. La arquitectura sigue principios de **Clean Architecture** con separación clara de responsabilidades.

## Estructura de Carpetas

```
src/
├── app/                    # Capa de Aplicación (Entry Point)
│   ├── server.ts          # Servidor Bun + manejo de errores global
│   ├── router.ts          # Router principal y handlers
│   ├── request-context.ts # Contexto de request con auth
│   └── logger.ts          # Logging estructurado JSON
├── modules/               # Capa de Dominio (Features)
│   ├── system/           # Health checks
│   ├── push/             # Web Push notifications
│   ├── rest/             # Timer de descanso + scheduler
│   ├── profile/          # Perfiles de usuario
│   ├── exercises/        # CRUD de ejercicios
│   ├── routines/         # CRUD de rutinas
│   ├── sessions/         # Sesiones de entrenamiento
│   ├── workouts/         # Workouts legacy
│   ├── dashboard/        # Datos del dashboard
│   ├── admin/            # Endpoints de administración
│   └── musclewiki/       # Integración con MuscleWiki
├── shared/               # Capa de Infraestructura
│   ├── persistence/     # Acceso a datos (SQLite)
│   ├── http/            # Utilidades HTTP
│   ├── auth/            # Autenticación JWT (Clerk)
│   ├── config/          # Configuración de entorno
│   ├── validation/      # Validaciones de input
│   └── push/            # Wrapper Web Push
└── index.ts             # Entry point

scripts/                  # Scripts de utilidad/migración
├── migrate-from-json.ts
├── export-firestore.ts
├── export-firebase-auth-users.ts
├── import-clerk-users.ts
├── audit-auth-migration.ts
├── backfill-sessions.ts
└── cleanup-system-data.ts

tests/                    # Tests unitarios (Vitest)
```

## Flujo de Datos

```
Request → Server → Router → Module Handler → Repository → Database
              ↓              ↓                    ↓
         Logger        Validation          Error Handler
              ↓              ↓
         CORS         Auth (JWT)
```

## Capas de Arquitectura

### 1. Capa de Aplicación (`app/`)

**Responsabilidad:** Orquestación y configuración

- **server.ts**: Inicializa el servidor Bun, configura middleware global (CORS, logging, error handling)
- **router.ts**: Enrutamiento de requests a los handlers correspondientes
- **request-context.ts**: Gestión de contexto de request incluyendo autenticación
- **logger.ts**: Logging estructurado en formato JSON

**Patrones:**
- Dependency Injection (contexto pasado a handlers)
- Middleware pattern (error handling global)

### 2. Capa de Dominio (`modules/`)

**Responsabilidad:** Lógica de negocio por feature

Cada módulo contiene:
- `routes.ts`: Definición de endpoints HTTP
- `service.ts`: Lógica de negocio (si aplica)
- `*.test.ts`: Tests unitarios

**Ejemplo de estructura:**
```typescript
// modules/push/routes.ts
export const handlePushRoutes: AppRouteHandler = async (req, url, context, meta) => {
  if (req.method === 'GET' && url.pathname === '/v1/push/vapidPublicKey') {
    return withCors(req, json({ vapidPublicKey: context.env.vapidPublicKey }), context.env.allowedOrigins);
  }
  // ... más rutas
  return null; // No manejado
};
```

**Patrones:**
- Route Handlers (funciones que retornan Response | null)
- Feature-based organization

### 3. Capa de Infraestructura (`shared/`)

**Responsabilidad:** Implementaciones técnicas

- **persistence/**: 
  - `sqlite.ts`: 38 funciones para operaciones de base de datos
  - `data-store.ts`: Operaciones de negocio de alto nivel
  
- **http/**: Utilidades HTTP (JSON, CORS, body parsing)
- **auth/**: Autenticación con Clerk (JWT verification)
- **validation/**: Validación de inputs de request
- **push/**: Wrapper de web-push para notificaciones
- **config/**: Carga y validación de variables de entorno

**Patrones:**
- Repository Pattern (sqlite.ts)
- Utility functions (http.ts)

## Patrones de Diseño Clave

### 1. Route Handler Pattern

```typescript
export type AppRouteHandler = (
  req: Request,
  url: URL,
  context: AppRouteContext,
  meta?: RequestLogMeta
) => Promise<Response | null>;
```

- Retorna `Response` si maneja la request
- Retorna `null` si no maneja la request (pasar al siguiente handler)

### 2. Context Injection

```typescript
export interface AppRouteContext {
  env: Env;
  db: Database;
  requireAuth: (req: Request, meta?: RequestLogMeta) => Promise<AuthContext>;
  musclewiki: ReturnType<typeof createMusclewikiService>;
}
```

Todas las dependencias se inyectan a través del contexto.

### 3. Error Handling

**Errores HTTP:** Lanzar objetos Response
```typescript
if (!isValid) {
  return withCors(req, json({ error: 'invalid_device_id' }, { status: 400 }), origins);
}
```

**Errores internos:** Loggear y retornar 500
```typescript
try {
  await riskyOperation();
} catch (error) {
  logError({ event: 'operation_failed', ...toErrorDetails(error) });
  return withCors(req, json({ error: 'internal_error' }, { status: 500 }), origins);
}
```

### 4. Database Patterns

**Columnas en DB (snake_case) → TypeScript (camelCase):**
```typescript
// SQL
SELECT device_id as deviceId, execute_at_ms as executeAtMs FROM jobs;

// TypeScript
interface JobRow {
  deviceId: string;
  executeAtMs: number;
}
```

**Queries parametrizadas (nunca interpolación de strings):**
```typescript
db.query('SELECT * FROM users WHERE id = ?').get(userId);
```

## Seguridad

### Autenticación
- JWT tokens de Clerk
- Verificación con JWKS remoto
- Caché de tokens para performance

### Autorización
- Middleware `requireAuth()` valida JWT
- Validación de admin por email + user ID

### CORS
- Orígenes explícitos configurables
- Headers permitidos: `content-type`, `authorization`
- Métodos permitidos: GET, POST, OPTIONS

### Validación de Input
- Todas las entradas validadas antes de DB
- Sanitización de timestamps (prevenir manipulación)
- Límites de tamaño en payloads (1MB default)

## Testing

### Framework
- **Vitest**: Testing framework
- **@vitest/coverage-v8**: Cobertura de código

### Estrategia
- **Tests unitarios**: Cada módulo tiene su archivo `.test.ts`
- **Mocking**: Base de datos y servicios externos mockeados
- **Coverage objetivo**: >80% (actual: 96.98%)

### Estructura de Tests
```typescript
describe('Feature', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do something', () => {
    // Test
    expect(result).toBe(expected);
  });
});
```

### Comandos
```bash
bun test              # Ejecutar tests
bun test:watch        # Modo watch
bun test:coverage     # Con reporte de cobertura
```

## Dependencias

### Runtime
- `bun:sqlite`: Base de datos SQLite nativa
- `jose`: Verificación JWT
- `web-push`: Notificaciones push Web

### Desarrollo
- `typescript`: Tipado estático
- `@types/bun`: Tipos de Bun
- `vitest`: Testing
- `@vitest/coverage-v8`: Cobertura
- `firebase-admin`: Scripts de migración

## Escalabilidad

### Consideraciones Actuales
- ✅ SQLite con WAL mode (buena concurrencia para lecturas)
- ✅ Scheduler interno (no dependencias externas)
- ✅ Caché de JWT (reduce llamadas a Clerk)
- ✅ Índices en queries frecuentes

### Posibles Mejoras
- Separar scheduler a worker independiente
- Cache Redis para sesiones frecuentes
- Sharding de base de datos por usuario (si escala mucho)

## Convenciones de Código

### Nomenclatura
- **Tipos/Interfaces**: PascalCase (`UserProfile`)
- **Funciones**: camelCase (`getUserProfile`)
- **Constantes**: camelCase (`maxRetryAttempts`)
- **DB columnas**: snake_case en SQL, camelCase en TS

### Imports
```typescript
// 1. Imports de tipo
import type { Database } from 'bun:sqlite';

// 2. Imports de dependencias externas
import { jwtVerify } from 'jose';

// 3. Imports internos
import { json } from '../shared/http/http';

// 4. Imports de tipo internos
import type { AppRouteHandler } from '../../app/router';
```

### Formato
- 2 espacios de indentación
- Comillas simples
- Coma final en objetos/arrays multilínea
- Límite de 100 caracteres por línea

## Scripts de Migración

Los scripts en `scripts/` permiten:
- Migrar desde Firestore (JSON export)
- Exportar usuarios de Firebase Auth
- Importar usuarios a Clerk
- Auditar migraciones
- Limpiar datos de sistema

**Uso:**
```bash
bun run migrate:json --input firestore-export.json --database /data/push.sqlite
bun run export:firestore --service-account /path/to/serviceAccount.json
```

## Documentación Adicional

- `AGENTS.md`: Guía para agentes de código
- `README.md`: Documentación de uso general
- `ARCHITECTURE.md`: Este archivo
