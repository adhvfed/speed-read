import { describe, expect, it, vi } from 'vitest';
import worker from './quiz-rate-limit';

describe('quiz rate-limit service', () => {
  it('provides a local process health endpoint without touching a limit', async () => {
    const response = await worker.fetch(new Request('https://internal/health'), {} as never);
    expect(response.status).toBe(204);
  });

  it('requires valid internal keys and combines both platform limits', async () => {
    const clientLimit = vi.fn(async () => ({ success: true }));
    const networkLimit = vi.fn(async () => ({ success: false }));
    const response = await worker.fetch(new Request('https://internal/limit', {
      method: 'POST',
      body: JSON.stringify({ clientId: 'browser-1234567890', network: '192.0.2.1' }),
    }), {
      QUIZ_CLIENT_RATE_LIMITER: { limit: clientLimit },
      QUIZ_NETWORK_RATE_LIMITER: { limit: networkLimit },
    } as never);

    expect(response.status).toBe(429);
    expect(clientLimit).toHaveBeenCalledOnce();
    expect(networkLimit).toHaveBeenCalledOnce();
  });

  it('rejects malformed calls before spending platform limit tokens', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const response = await worker.fetch(new Request('https://internal/limit', {
      method: 'POST', body: '{}',
    }), {
      QUIZ_CLIENT_RATE_LIMITER: { limit },
      QUIZ_NETWORK_RATE_LIMITER: { limit },
    } as never);

    expect(response.status).toBe(400);
    expect(limit).not.toHaveBeenCalled();
  });
});
