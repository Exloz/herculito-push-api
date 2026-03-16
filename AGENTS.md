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
