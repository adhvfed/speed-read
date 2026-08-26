import type { ArticleContent } from '../types';
import type { ReadingQuiz } from '../types';
import { buildQuizExcerpt, isReadingQuiz } from './quiz';

const QUIZ_CLIENT_KEY = 'speed-read:quiz-client:v1';

function quizClientId(): string {
  try {
    const stored = localStorage.getItem(QUIZ_CLIENT_KEY);
    if (stored) return stored;
    const created = globalThis.crypto?.randomUUID?.() ?? `browser-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(QUIZ_CLIENT_KEY, created);
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

export async function extractArticle(url: string): Promise<ArticleContent> {
  return json<ArticleContent>(
    await fetch('/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  );
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
        'x-speed-read-client': quizClientId(),
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
