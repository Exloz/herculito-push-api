export const json = (data: unknown, init?: ResponseInit): Response => {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
};

export const getJsonBody = async <T>(req: Request): Promise<T> => {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw json({ error: 'invalid_content_type' }, { status: 415 });
  }

  try {
    return (await req.json()) as T;
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

  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type,authorization');
  headers.set('access-control-max-age', '600');

  return new Response(null, { status: 204, headers });
};
