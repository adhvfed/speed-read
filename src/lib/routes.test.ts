import { describe, expect, it } from 'vitest';
import { parseHashRoute, quizHash, readerHash } from './routes';

describe('local hash routes', () => {
  it('round-trips a saved article and semantic word position', () => {
    const hash = readerHash('abcdef0123456789', 42);
    expect(parseHashRoute(hash)).toEqual({ view: 'reader', articleId: 'abcdef0123456789', word: 42 });
  });

  it('ignores malformed or missing article hashes', () => {
    expect(parseHashRoute('#read/not-a-real-id/12')).toEqual({ view: 'home' });
    expect(parseHashRoute('#anything')).toEqual({ view: 'home' });
  });

  it('round-trips a completed-session quiz', () => {
    const hash = quizHash('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    expect(parseHashRoute(hash)).toEqual({ view: 'quiz', sessionId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });
  });
});
