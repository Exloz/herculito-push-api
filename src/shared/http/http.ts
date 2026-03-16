export const json = (data: unknown, init?: ResponseInit): Response => {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
};

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

export const getJsonBody = async <T>(req: Request, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<T> => {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw json({ error: 'invalid_content_type' }, { status: 415 });
  }

  const lengthHeader = req.headers.get('content-length');
  if (lengthHeader) {
    const length = Number(lengthHeader);
    if (Number.isFinite(length) && (length < 0 || length > maxBytes)) {
      throw json({ error: 'payload_too_large' }, { status: 413 });
    }
  }

  if (!req.body) {
    throw json({ error: 'invalid_json' }, { status: 400 });
  }

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let rawBody = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;

    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      throw json({ error: 'payload_too_large' }, { status: 413 });
    }

    rawBody += decoder.decode(value, { stream: true });
  }

  rawBody += decoder.decode();

  if (!rawBody.trim()) {
    throw json({ error: 'invalid_json' }, { status: 400 });
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    throw json({ error: 'invalid_json' }, { status: 400 });
  }
};

export const withCors = (req: Request, res: Response, allowedOrigins: string[]): Response => {
  const origin = req.headers.get('origin');
  const headers = new Headers(res.headers);

  if (origin && allowedOrigins.includes(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
    headers.set('access-control-allow-credentials', 'true');
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers
  });
};

export const corsPreflight = (req: Request, allowedOrigins: string[]): Response => {
  const origin = req.headers.get('origin');
  const headers = new Headers();

  if (origin && allowedOrigins.includes(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
    headers.set('access-control-allow-credentials', 'true');
  }

  headers.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type,authorization');
  headers.set('access-control-max-age', '600');

  return new Response(null, { status: 204, headers });
};
