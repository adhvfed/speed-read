import { describe, expect, it, vi } from 'vitest';
import { onRequestGet, onRequestPost } from './quiz';

function context(request: Request, env: Record<string, unknown>) {
  return { request, env } as never;
}

describe('/api/quiz', () => {
  it('reports unavailable without exposing a missing secret error', async () => {
    const response = await onRequestGet(context(new Request('https://speed-read.test/api/quiz'), {}));
    expect(response).toBeInstanceOf(Response);
    expect(await (response as Response).json()).toEqual({ available: false });
  });

  it('fails closed when a key exists without the production limiter binding', async () => {
    const get = await onRequestGet(context(new Request('https://speed-read.test/api/quiz'), {
      OPENAI_API_KEY: 'opaque-test-key',
    }));
    expect(await (get as Response).json()).toEqual({ available: false });

    const post = await onRequestPost(context(new Request('https://speed-read.test/api/quiz', {
      method: 'POST',
    }), { OPENAI_API_KEY: 'opaque-test-key' }));
    expect((post as Response).status).toBe(503);
  });

  it('rejects a cross-origin source before using a rate-limit token', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const response = await onRequestPost(context(new Request('https://speed-read.test/api/quiz', {
      method: 'POST',
      headers: {
        origin: 'https://attacker.test',
        'content-type': 'application/json',
        'x-speed-read-client': 'browser-1234567890',
      },
      body: JSON.stringify({ title: 'Reading', text: 'word '.repeat(30) }),
    }), {
      OPENAI_API_KEY: 'opaque-test-key',
      QUIZ_RATE_LIMITER: { fetch },
    }));
    expect((response as Response).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('enforces the bound limiter service before calling the model', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 429 }));
    const response = await onRequestPost(context(new Request('https://speed-read.test/api/quiz', {
      method: 'POST',
      headers: {
        origin: 'https://speed-read.test',
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
        'x-speed-read-client': 'browser-1234567890',
        'cf-connecting-ip': '192.0.2.1',
      },
      body: JSON.stringify({ title: 'Reading', text: 'word '.repeat(30) }),
    }), {
      OPENAI_API_KEY: 'opaque-test-key',
      QUIZ_RATE_LIMITER: { fetch },
    }));
    expect((response as Response).status).toBe(429);
    expect((response as Response).headers.get('retry-after')).toBe('60');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('spends a limit token before rejecting malformed and oversized bodies', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const env = {
      OPENAI_API_KEY: 'opaque-test-key',
      QUIZ_RATE_LIMITER: { fetch },
    };
    const headers = {
      origin: 'https://speed-read.test',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'x-speed-read-client': 'browser-1234567890',
    };

    const malformed = await onRequestPost(context(new Request('https://speed-read.test/api/quiz', {
      method: 'POST', headers, body: '{not json',
    }), env));
    expect((malformed as Response).status).toBe(400);

    const oversizedRequest = new Request('https://speed-read.test/api/quiz', {
      method: 'POST', headers, body: JSON.stringify({ title: 'Reading', text: 'x'.repeat(111_000) }),
    });
    expect(oversizedRequest.headers.has('content-length')).toBe(false);
    const oversized = await onRequestPost(context(oversizedRequest, env));
    expect((oversized as Response).status).toBe(413);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
