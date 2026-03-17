import { describe, it, expect } from 'vitest';
import { json, getJsonBody, withCors, corsPreflight } from './http';

describe('json', () => {
  it('should create JSON response with default status', () => {
    const data = { message: 'test' };
    const response = json(data);
    
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  });

  it('should create JSON response with custom status', () => {
    const data = { error: 'not_found' };
    const response = json(data, { status: 404 });
    
    expect(response.status).toBe(404);
  });

  it('should create JSON response with custom headers', () => {
    const data = { message: 'test' };
    const response = json(data, { 
      status: 200,
      headers: { 'x-custom': 'value' }
    });
    
    expect(response.headers.get('x-custom')).toBe('value');
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  });
});

describe('getJsonBody', () => {
  it('should parse valid JSON body', async () => {
    const data = { name: 'test', value: 123 };
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await getJsonBody<typeof data>(request);
    expect(result).toEqual(data);
  });

  it('should throw 415 for invalid content type', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'test'
    });

    await expect(getJsonBody(request)).rejects.toBeInstanceOf(Response);
    try {
      await getJsonBody(request);
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(415);
    }
  });

  it('should throw 413 for payload too large via content-length', async () => {
    const largeData = 'x'.repeat(2 * 1024 * 1024);
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 
        'content-type': 'application/json',
        'content-length': String(largeData.length)
      },
      body: largeData
    });

    await expect(getJsonBody(request)).rejects.toBeInstanceOf(Response);
    try {
      await getJsonBody(request);
    } catch (error) {
      expect((error as Response).status).toBe(413);
    }
  });

  it('should throw 400 for empty body', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' }
    });

    await expect(getJsonBody(request)).rejects.toBeInstanceOf(Response);
    try {
      await getJsonBody(request);
    } catch (error) {
      expect((error as Response).status).toBe(400);
    }
  });

  it('should throw 400 for invalid JSON', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not valid json'
    });

    let thrownError: Response | null = null;
    try {
      await getJsonBody(request);
    } catch (error) {
      thrownError = error as Response;
    }
    expect(thrownError).toBeInstanceOf(Response);
    expect(thrownError?.status).toBe(400);
  });

  it('should respect custom max bytes limit', async () => {
    const data = { test: 'data' };
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data)
    });

    // Should work with larger limit
    const result = await getJsonBody<typeof data>(request, 100);
    expect(result).toEqual(data);

    // Should fail with smaller limit
    const request2 = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ large: 'x'.repeat(200) })
    });

    await expect(getJsonBody(request2, 100)).rejects.toBeInstanceOf(Response);
  });
});

describe('withCors', () => {
  it('should add CORS headers for allowed origin', () => {
    const originalResponse = new Response('test');
    const request = new Request('http://localhost', {
      headers: { origin: 'https://example.com' }
    });
    const allowedOrigins = ['https://example.com'];

    const response = withCors(request, originalResponse, allowedOrigins);
    
    expect(response.headers.get('access-control-allow-origin')).toBe('https://example.com');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('vary')).toBe('Origin');
  });

  it('should not add CORS headers for disallowed origin', () => {
    const originalResponse = new Response('test');
    const request = new Request('http://localhost', {
      headers: { origin: 'https://evil.com' }
    });
    const allowedOrigins = ['https://example.com'];

    const response = withCors(request, originalResponse, allowedOrigins);
    
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('should preserve original response status and body', () => {
    const originalResponse = new Response('test body', { status: 201 });
    const request = new Request('http://localhost', {
      headers: { origin: 'https://example.com' }
    });
    const allowedOrigins = ['https://example.com'];

    const response = withCors(request, originalResponse, allowedOrigins);
    
    expect(response.status).toBe(201);
  });

  it('should handle missing origin header', () => {
    const originalResponse = new Response('test');
    const request = new Request('http://localhost');
    const allowedOrigins = ['https://example.com'];

    const response = withCors(request, originalResponse, allowedOrigins);
    
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('corsPreflight', () => {
  it('should return 204 for preflight with allowed origin', () => {
    const request = new Request('http://localhost', {
      method: 'OPTIONS',
      headers: { origin: 'https://example.com' }
    });
    const allowedOrigins = ['https://example.com'];

    const response = corsPreflight(request, allowedOrigins);
    
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://example.com');
    expect(response.headers.get('access-control-allow-methods')).toBe('GET,POST,PUT,DELETE,OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe('content-type,authorization');
    expect(response.headers.get('access-control-max-age')).toBe('600');
  });

  it('should return 204 without CORS headers for disallowed origin', () => {
    const request = new Request('http://localhost', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.com' }
    });
    const allowedOrigins = ['https://example.com'];

    const response = corsPreflight(request, allowedOrigins);
    
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('access-control-allow-methods')).toBe('GET,POST,PUT,DELETE,OPTIONS');
  });
});
