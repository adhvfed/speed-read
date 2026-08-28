import type { ArticleContent } from '../types';
import type { ReadingQuiz } from '../types';
import { buildQuizExcerpt, isReadingQuiz } from './quiz';

const AI_CLIENT_KEY = 'speed-read:ai-client:v1';
export const WIKIPEDIA_RANDOM_API = 'https://en.wikipedia.org/w/api.php';
const WIKIPEDIA_CLIENT = 'speed-read/0.2 (https://github.com/adhvfed/speed-read)';

export interface WikipediaSelection {
  pageId: number;
  title: string;
  url: string;
}

function aiClientId(): string {
  try {
    const stored = localStorage.getItem(AI_CLIENT_KEY);
    if (stored) return stored;
    const created = globalThis.crypto?.randomUUID?.() ?? `browser-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(AI_CLIENT_KEY, created);
    return created;
  } catch {
    return globalThis.crypto?.randomUUID?.() ?? `browser-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
  return body;
}

export async function extractArticle(url: string, signal?: AbortSignal): Promise<ArticleContent> {
  return json<ArticleContent>(
    await fetch('/api/extract', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  );
}

export async function randomWikipediaArticle(request: typeof fetch = fetch, signal?: AbortSignal): Promise<WikipediaSelection> {
  const url = new URL(WIKIPEDIA_RANDOM_API);
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'random',
    grnnamespace: '0',
    grnfilterredir: 'nonredirects',
    grnminsize: '1000',
    grnlimit: '1',
    prop: 'info',
    inprop: 'url',
    maxlag: '5',
    origin: '*',
  }).toString();

  let response: Response;
  try {
    response = await request(url, {
      method: 'GET',
      signal,
      headers: {
        accept: 'application/json',
        'api-user-agent': WIKIPEDIA_CLIENT,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Wikipedia could not be reached. Check your connection and roll again.');
  }

  const body = await response.json().catch(() => ({})) as {
    error?: { code?: unknown };
    query?: { pages?: Array<{ pageid?: unknown; title?: unknown; fullurl?: unknown }> };
  };
  const apiCode = typeof body.error?.code === 'string' ? body.error.code : '';
  if (response.status === 429 || response.status === 503 || ['maxlag', 'ratelimited'].includes(apiCode)) {
    const retryAfter = response.headers.get('retry-after');
    const wait = retryAfter && /^\d+$/.test(retryAfter) ? ` Wait ${retryAfter} seconds, then roll again.` : ' Roll again in a moment.';
    throw new Error(`Wikipedia is busy right now.${wait}`);
  }
  if (!response.ok || apiCode) throw new Error('Wikipedia could not choose an article. Roll again.');

  const page = body.query?.pages?.[0];
  if (!page || typeof page.pageid !== 'number' || typeof page.title !== 'string' || typeof page.fullurl !== 'string') {
    throw new Error('Wikipedia returned an incomplete article. Roll again.');
  }
  return { pageId: page.pageid, title: page.title, url: page.fullurl };
}

export async function isQuizAvailable(): Promise<boolean> {
  try {
    const response = await fetch('/api/quiz', { headers: { accept: 'application/json' } });
    if (!response.ok) return false;
    const body = (await response.json()) as { available?: unknown };
    return body.available === true;
  } catch {
    return false;
  }
}

export async function generateQuiz(article: ArticleContent): Promise<ReadingQuiz> {
  const quiz = await json<ReadingQuiz>(
    await fetch('/api/quiz', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-speed-read-client': aiClientId(),
      },
      body: JSON.stringify({
        title: article.title.slice(0, 300),
        text: buildQuizExcerpt(article.paragraphs),
      }),
    }),
  );
  if (!isReadingQuiz(quiz)) throw new Error('The quiz response was incomplete. Try again.');
  return quiz;
}

export async function generateTitle(paragraphs: string[]): Promise<string> {
  const text = paragraphs.join('\n\n').slice(0, 6_000).trim();
  const result = await json<{ title?: unknown }>(
    await fetch('/api/title', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-speed-read-client': aiClientId(),
      },
      body: JSON.stringify({ text }),
    }),
  );
  if (typeof result.title !== 'string') throw new Error('The generated title was incomplete.');
  const title = result.title.replace(/\s+/g, ' ').trim();
  if (title.length < 3 || title.length > 100) throw new Error('The generated title was invalid.');
  return title;
}
