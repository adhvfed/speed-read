import { describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './title';

function context(request: Request, env: Record<string, unknown>) {
  return { request, env } as never;
}

describe('/api/title', () => {
  it('stays unavailable when the secret is absent', async () => {
    const response = await onRequestPost(context(new Request('https://speed-read.test/api/title', { method: 'POST' }), {}));
    expect((response as Response).status).toBe(404);
  });

  it('rejects cross-origin input before using a rate-limit token', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const response = await onRequestPost(context(new Request('https://speed-read.test/api/title', {
      method: 'POST',
      headers: {
        origin: 'https://attacker.test',
        'content-type': 'application/json',
        'x-speed-read-client': 'browser-1234567890',
      },
      body: JSON.stringify({ text: 'word '.repeat(30) }),
    }), {
      OPENAI_API_KEY: 'opaque-test-key',
      QUIZ_RATE_LIMITER: { fetch },
    }));
    expect((response as Response).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('enforces the existing AI limiter before calling the model', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 429 }));
    const response = await onRequestPost(context(new Request('https://speed-read.test/api/title', {
      method: 'POST',
      headers: {
        origin: 'https://speed-read.test',
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
        'x-speed-read-client': 'browser-1234567890',
      },
      body: JSON.stringify({ text: 'word '.repeat(30) }),
    }), {
      OPENAI_API_KEY: 'opaque-test-key',
      QUIZ_RATE_LIMITER: { fetch },
    }));
    expect((response as Response).status).toBe(429);
    expect((response as Response).headers.get('retry-after')).toBe('60');
    expect(fetch).toHaveBeenCalledOnce();
  });
});
