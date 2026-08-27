import { describe, expect, it } from 'vitest';
import type { CompletedSession } from '../types';
import { accuracyBySpeed } from './stats';

function session(endWpm: number, quizScore?: number, quizTotal?: number, measuredWpm?: number): CompletedSession {
  return {
    id: `${endWpm}-${quizScore ?? 'none'}`,
    title: 'Article',
    sourceUrl: 'https://en.wikipedia.org/wiki/Article',
    sourceType: 'wikipedia',
    wordCount: 500,
    startedAt: '2026-08-27T07:00:00.000Z',
    completedAt: '2026-08-27T07:02:00.000Z',
    durationSeconds: 120,
    startWpm: endWpm,
    endWpm,
    measuredWpm,
    totalLines: 40,
    quizScore,
    quizTotal,
  };
}

describe('accuracy by speed', () => {
  it('groups scored reads into 100 wpm bands and ignores unscored reads', () => {
    expect(accuracyBySpeed([
      session(250, 3, 4),
      session(275, 4, 4),
      session(320, 2, 4),
      session(450),
    ])).toEqual([
      { minWpm: 200, maxWpm: 299, label: '200–299', correct: 7, total: 8, reads: 2, accuracy: 88 },
      { minWpm: 300, maxWpm: 399, label: '300–399', correct: 2, total: 4, reads: 1, accuracy: 50 },
    ]);
  });

  it('uses measured reading speed when a run changed target pace', () => {
    expect(accuracyBySpeed([session(500, 3, 4, 340)])[0].label).toBe('300–399');
  });
});
