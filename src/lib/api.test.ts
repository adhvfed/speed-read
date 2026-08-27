import { describe, expect, it, vi } from 'vitest';
import { randomWikipediaArticle } from './api';

describe('Wikipedia roulette API', () => {
  it('requests one useful English article with an identifiable client header', async () => {
    let requestedUrl = '';
    let requestedOptions: RequestInit | undefined;
    const request = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      requestedUrl = String(input);
      requestedOptions = options;
      return new Response(JSON.stringify({
        query: { pages: [{ pageid: 42, title: 'Random article', fullurl: 'https://en.wikipedia.org/wiki/Random_article' }] },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    await expect(randomWikipediaArticle(request as typeof fetch)).resolves.toEqual({
      pageId: 42,
      title: 'Random article',
      url: 'https://en.wikipedia.org/wiki/Random_article',
    });

    const parsed = new URL(requestedUrl);
    expect(parsed.searchParams.get('generator')).toBe('random');
    expect(parsed.searchParams.get('grnnamespace')).toBe('0');
    expect(parsed.searchParams.get('grnfilterredir')).toBe('nonredirects');
    expect(parsed.searchParams.get('grnlimit')).toBe('1');
    expect(parsed.searchParams.get('maxlag')).toBe('5');
    expect(new Headers(requestedOptions?.headers).get('api-user-agent')).toContain('github.com/adhvfed/speed-read');
  });

  it('turns load and rate-limit responses into a recoverable message', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'maxlag' } }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'retry-after': '7' },
    }));
    await expect(randomWikipediaArticle(request as typeof fetch)).rejects.toThrow('Wait 7 seconds, then roll again.');
  });
});
