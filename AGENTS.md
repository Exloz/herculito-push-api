# AGENTS.md - Herculito Push API

Agentic coding guidelines for the Herculito Push API repository.

## Project Overview

Bun-based REST API for Web Push notifications and workout data persistence. Uses SQLite (bun:sqlite) for storage and Clerk for JWT authentication.

## Build/Lint/Test Commands

```bash
# Development (watch mode)
bun run dev

# Production start
bun run start

# Type check main source
bun run check

# Type check scripts
bun run check:scripts

# Run tests
bun test

# Run tests in watch mode
bun test:watch

# Run tests with coverage
bun test:coverage

# Run single test
bun test src/shared/http/http.test.ts
```

## Code Style Guidelines

### Imports

- Use ES modules (`"type": "module"` in package.json)
- Group imports: external deps → internal modules → types
- Use `type` imports for TypeScript types: `import type { Foo } from '...'`
- Bun built-ins: `import { Database } from 'bun:sqlite'`

```typescript
// Good
import type { Database } from 'bun:sqlite';
import { json } from '../shared/http/http';
import type { AppRouteHandler } from '../../app/router';
```

### Formatting

- 2 spaces indentation
- Single quotes for strings
- Trailing commas in multi-line objects/arrays
- Max line length: 100 (soft limit)

### Types & Naming

- **Interfaces/Types**: PascalCase (e.g., `Env`, `RequestContext`)
- **Functions**: camelCase, descriptive verbs (e.g., `getDashboardData`)
- **Constants**: camelCase (e.g., `DEFAULT_MAX_BODY_BYTES`)
- **Database columns**: snake_case in SQL, camelCase in TypeScript
- Use explicit return types on exported functions
- Prefer `interface` over `type` for object shapes

```typescript
export interface JobRow {
  id: string;
  uid: string;
  executeAtMs: number;  // camelCase in TS
}

// SQL: execute_at_ms (snake_case)
```

### Error Handling

- HTTP errors: throw Response objects via `json()` helper
- Use structured error codes: `{ error: 'descriptive_code' }`
- Never expose internal error details to clients
- Log errors with `logError()` from `src/app/logger.ts`

```typescript
// Good - throw Response for HTTP errors
if (!isValid) {
  return withCors(req, json({ error: 'invalid_device_id' }, { status: 400 }), origins);
}

// Good - structured logging
try {
  await riskyOperation();
} catch (error) {
  logError({ event: 'operation_failed', ...toErrorDetails(error) });
  return withCors(req, json({ error: 'internal_error' }, { status: 500 }), origins);
}
```

### Database Patterns

- Use parameterized queries (never string interpolation)
- Column aliases for camelCase mapping: `execute_at_ms as executeAtMs`
- Return `null` for missing single rows, empty arrays for lists
- Use `Date.now()` for timestamps (milliseconds)

### HTTP Patterns

- Wrap responses with `withCors()` for CORS headers
- Route handlers return `Promise<Response | null>` (null = not handled)
- Use `getJsonBody<T>()` for parsing JSON with size limits

### Logging

- Use structured JSON logging via `logInfo()` / `logError()`
- Include `event` field for log categorization
- Include `requestId` for request correlation

### Environment Variables

- Define in `src/shared/config/env.ts`
- Use `requireEnv()` for mandatory vars
- Provide sensible defaults for development
- Validate numeric values with `Number.isFinite()`

## Project Structure

```
src/
  app/           # Server, router, request context
  modules/       # Feature routes (push, rest, workouts, etc.)
  shared/        # Utils, auth, persistence, http helpers
scripts/         # One-off migration/utility scripts
```

## Key Conventions

1. **Route handlers**: Export `handleXRoutes: AppRouteHandler` from `src/modules/*/routes.ts`
2. **Auth**: Use `context.requireAuth()` to get `uid` and validate JWT
3. **Timestamps**: Use milliseconds (Unix epoch) for all timestamps
4. **IDs**: Use `crypto.randomUUID()` for generating IDs
5. **Database migrations**: Handle schema migrations gracefully in `createDb()`

## Dependencies

- Runtime: Bun (built-in SQLite, fetch, crypto)
- JWT: `jose`
- Push: `web-push`
- Dev: TypeScript, @types/bun

## Testing Guidelines

### Framework: Vitest

- Tests ubicados junto al código: `*.test.ts`
- Cobertura objetivo: >80% (actual: 96.98%)
- Usar mocks para base de datos y servicios externos

### Estructura de Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do something', () => {
    const result = functionToTest();
    expect(result).toBe(expected);
  });
});
```

### Testing Database

Usar `:memory:` para tests de SQLite:
```typescript
const db = createDb(':memory:');
```

### Testing HTTP Routes

Mock del contexto:
```typescript
const mockContext = {
  env: { /* ... */ },
  db: mockDb,
  requireAuth: vi.fn().mockResolvedValue({ uid: 'test' }),
  musclewiki: { suggest: vi.fn(), getVideos: vi.fn() }
};
```

## Architecture

El proyecto sigue Clean Architecture con 3 capas:

1. **app/** - Entry point, routing, middleware
2. **modules/** - Feature routes y lógica de negocio
3. **shared/** - Infraestructura (DB, HTTP, auth, validation)

Ver `ARCHITECTURE.md` para documentación detallada.

## Security Notes

- Never commit `.env` or `serviceAccount.json`
- All admin endpoints require auth + admin check
- Validate all user input before database operations
- CORS origins must be explicitly configured in production

## Database Permissions (Critical for Deployment)

The application requires write access to the SQLite database file and its directory:

- **Database path**: Configurable via `DATABASE_PATH` env var (default: `/data/push.sqlite`)
- **Required permissions**: The application user (uid 1001 / `bunuser`) must have read/write access to:
  1. The database file (`/data/push.sqlite`)
  2. The database directory (`/data/`) for WAL and journal files

### Common Deployment Issues

#### Read-Only Database Error
```
SQLiteError: attempt to write a readonly database
```

**Solution**: Ensure the volume mount has correct permissions:
```bash
# For Docker deployments, chown the data directory before starting:
chown -R 1001:1001 /data

# Or in docker-compose.yml:
volumes:
  - ./data:/data
# Then: chown -R 1001:1001 ./data
```

#### Container User
The Dockerfile runs as `bunuser` (uid 1001). Ensure your volume mounts permit this user to write.

### Migration Safety

Schema migrations are designed to be non-fatal:
- Core schema migrations warn but continue on failure
- Sports module migrations log warnings for read-only databases but allow startup
- The app can start in degraded mode if migrations fail (some features unavailable)

## Sports Module

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/data/sports/sessions` | List sport sessions |
| GET | `/v1/data/sports/sessions/:id` | Get session details |
| POST | `/v1/data/sports/sessions/start` | Start new session |
| POST | `/v1/data/sports/sessions/:id/archery/rounds` | Add archery round |
| POST | `/v1/data/sports/sessions/:id/archery/rounds/:rid/ends` | Add end to round |
| POST | `/v1/data/sports/sessions/:id/complete` | Complete session |
| DELETE | `/v1/data/sports/sessions/:id` | Delete session |
| GET | `/v1/data/sports/stats` | Get sport statistics |

### Database Tables

- `sport_sessions` - Main sport session records
- `archery_rounds` - Rounds within archery sessions
- `archery_ends` - Ends (groups of arrows) within rounds
- `archery_arrows` - Individual arrow scores
