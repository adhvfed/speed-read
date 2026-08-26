import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLocalPace, loadLocalSessions, saveLocalPace, saveLocalSession } from './storage';

afterEach(() => vi.unstubAllGlobals());

describe('local progress storage', () => {
  it('falls back without crashing when browser storage is unavailable', () => {
    expect(loadLocalSessions()).toEqual([]);
    expect(loadLocalPace(275)).toBe(275);
    expect(() => saveLocalPace(300)).not.toThrow();
    expect(() => saveLocalSession({
      id: 'offline-session',
      title: 'Unavailable storage',
      sourceUrl: null,
      sourceType: 'text',
      wordCount: 100,
      startedAt: '2026-08-26T00:00:00.000Z',
      completedAt: '2026-08-26T00:01:00.000Z',
      durationSeconds: 60,
      startWpm: 250,
      endWpm: 275,
      totalLines: 10,
    })).not.toThrow();
  });

  it('restores only quiz results with four valid answers and a matching score', () => {
    const quiz = {
      questions: Array.from({ length: 4 }, (_, index) => ({
        prompt: `Question ${index + 1}`,
        choices: ['A', 'B', 'C', 'D'],
        correctIndex: index,
        explanation: 'Grounded explanation.',
      })),
    };
    const valid = {
      id: 'valid-session',
      title: 'Stored quiz',
      sourceUrl: null,
      sourceType: 'text',
      wordCount: 100,
      startedAt: '2026-08-26T00:00:00.000Z',
      completedAt: '2026-08-26T00:01:00.000Z',
      durationSeconds: 60,
      startWpm: 250,
      endWpm: 275,
      totalLines: 10,
      quiz,
      quizAnswers: [0, 1, 0, 3],
      quizScore: 3,
      quizTotal: 4,
    };
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify([
        valid,
        { ...valid, id: 'invalid-session', quizAnswers: [0, 1, 2], quizScore: 4 },
      ]),
      setItem: vi.fn(),
    });

    expect(loadLocalSessions()).toEqual([valid]);
  });
});
