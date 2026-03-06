export interface RequestLogMeta {
  requestId: string;
  method: string;
  path: string;
  startedAtMs: number;
  uid?: string;
}

export interface ErrorDetails {
  errorName?: string;
  errorMessage?: string;
  errorStack?: string;
}

export const logInfo = (payload: Record<string, unknown>): void => {
  console.log(
    JSON.stringify({
      level: 'info',
      ts: new Date().toISOString(),
      ...payload
    })
  );
};

export const logError = (payload: Record<string, unknown>): void => {
  console.error(
    JSON.stringify({
      level: 'error',
      ts: new Date().toISOString(),
      ...payload
    })
  );
};

export const toErrorDetails = (error: unknown): ErrorDetails => {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack
    };
  }

  if (typeof error === 'string') {
    return { errorMessage: error };
  }

  return {};
};

export const createRequestMeta = (req: Request): RequestLogMeta => {
  const startedAtMs = Date.now();

  return {
    requestId: globalThis.crypto?.randomUUID?.() ?? `req_${startedAtMs}_${Math.random().toString(16).slice(2)}`,
    method: req.method,
    path: new URL(req.url).pathname,
    startedAtMs
  };
};

export const logRequestIn = (meta: RequestLogMeta): void => {
  logInfo({
    event: 'api_in',
    requestId: meta.requestId,
    method: meta.method,
    path: meta.path,
    uid: meta.uid
  });
};

export const logRequestOut = (meta: RequestLogMeta, status: number): void => {
  logInfo({
    event: 'api_out',
    requestId: meta.requestId,
    method: meta.method,
    path: meta.path,
    uid: meta.uid,
    status,
    durationMs: Date.now() - meta.startedAtMs
  });
};
