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

  it('rejects a cross-origin source before using a rate-limit token', async () => {
    const limit = vi.fn(async () => ({ success: true }));
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
      QUIZ_CLIENT_RATE_LIMITER: { limit },
      QUIZ_NETWORK_RATE_LIMITER: { limit },
    }));
    expect((response as Response).status).toBe(403);
    expect(limit).not.toHaveBeenCalled();
  });

  it('enforces the platform limiter before calling the model', async () => {
    const allowed = vi.fn(async () => ({ success: true }));
    const blocked = vi.fn(async () => ({ success: false }));
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
      QUIZ_CLIENT_RATE_LIMITER: { limit: allowed },
      QUIZ_NETWORK_RATE_LIMITER: { limit: blocked },
    }));
    expect((response as Response).status).toBe(429);
    expect((response as Response).headers.get('retry-after')).toBe('60');
    expect(allowed).toHaveBeenCalledOnce();
    expect(blocked).toHaveBeenCalledOnce();
  });

  it('spends a limit token before rejecting malformed and oversized bodies', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const env = {
      OPENAI_API_KEY: 'opaque-test-key',
      QUIZ_CLIENT_RATE_LIMITER: { limit },
      QUIZ_NETWORK_RATE_LIMITER: { limit },
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
    expect(limit).toHaveBeenCalledTimes(4);
  });
});
