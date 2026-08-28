import { describe, expect, it } from 'vitest';
import type { GameRound } from '../types';
import {
  RANKS,
  SPEED_TIERS,
  bestCleanSpeed,
  bestStreak,
  currentStreak,
  estimatedSeconds,
  formatClock,
  rankFor,
  recordForWpm,
  reliableCeiling,
  scoreRound,
  speedMultiplier,
  tierForWpm,
  totalPoints,
} from './game';

function round(overrides: Partial<GameRound> & { completedAt: string }): GameRound {
  return {
    id: `round-${overrides.completedAt}`,
    title: 'An article',
    sourceUrl: 'https://en.wikipedia.org/wiki/Thing',
    wordCount: 600,
    committedWpm: 300,
    startedAt: overrides.completedAt,
    durationSeconds: 120,
    correct: 4,
    questions: 4,
    score: 1_800,
    passed: true,
    cleanSweep: true,
    streakBefore: 0,
    ...overrides,
  };
}

describe('speed tiers', () => {
  it('advertises a multiplier proportional to the committed speed', () => {
    expect(speedMultiplier(300)).toBe(3);
    expect(speedMultiplier(750)).toBe(7.5);
  });

  it('resolves an arbitrary speed to the nearest tier', () => {
    expect(tierForWpm(300).id).toBe('brisk');
    expect(tierForWpm(320).id).toBe('brisk');
    expect(tierForWpm(9_000).id).toBe('reckless');
  });

  it('keeps tiers ordered from slowest to fastest', () => {
    const speeds = SPEED_TIERS.map((tier) => tier.wpm);
    expect([...speeds].sort((a, b) => a - b)).toEqual(speeds);
  });
});

describe('round scoring', () => {
  it('pays correct answers times committed speed', () => {
    expect(scoreRound({ correct: 2, total: 4, wpm: 300, streak: 0 }).total).toBe(600);
  });

  it('makes the same points reachable by accuracy or by speed', () => {
    const careful = scoreRound({ correct: 4, total: 4, wpm: 300, streak: 0 });
    const reckless = scoreRound({ correct: 2, total: 4, wpm: 600, streak: 0 });
    expect(careful.base).toBe(reckless.base);
    // The clean sweep is what tips the wager back toward comprehension.
    expect(careful.total).toBeGreaterThan(reckless.total);
  });

  it('stacks the clean sweep and streak bonuses as the scoreboard shows them', () => {
    const result = scoreRound({ correct: 4, total: 4, wpm: 350, streak: 3 });
    expect(result.base).toBe(1_400);
    expect(result.cleanSweepBonus).toBe(700);
    expect(result.streakMultiplier).toBeCloseTo(1.3);
    expect(result.streakBonus).toBe(630);
    expect(result.total).toBe(2_730);
  });

  it('caps the streak multiplier so a long run cannot run away', () => {
    expect(scoreRound({ correct: 1, total: 4, wpm: 100, streak: 40 }).streakMultiplier).toBe(2);
  });

  it('passes at three of four and fails below it', () => {
    expect(scoreRound({ correct: 3, total: 4, wpm: 200, streak: 0 }).passed).toBe(true);
    expect(scoreRound({ correct: 2, total: 4, wpm: 200, streak: 0 }).passed).toBe(false);
  });

  it('still pays something for a failed round', () => {
    expect(scoreRound({ correct: 2, total: 4, wpm: 400, streak: 0 }).total).toBeGreaterThan(0);
  });
});

describe('ranks', () => {
  it('starts at the first rank and reports progress toward the next', () => {
    const progress = rankFor(0);
    expect(progress.current.name).toBe(RANKS[0].name);
    expect(progress.next?.name).toBe(RANKS[1].name);
    expect(progress.fraction).toBe(0);
  });

  it('reports a fraction through the current rank', () => {
    const progress = rankFor(5_000);
    expect(progress.current.name).toBe('Skimmer');
    expect(progress.fraction).toBeCloseTo(0.5);
    expect(progress.pointsNeeded).toBe(2_500);
  });

  it('tops out at the final rank without a next target', () => {
    const progress = rankFor(1_000_000);
    expect(progress.current.name).toBe(RANKS[RANKS.length - 1].name);
    expect(progress.next).toBeNull();
    expect(progress.fraction).toBe(1);
  });
});

describe('player record', () => {
  const rounds = [
    round({ completedAt: '2026-08-20T10:00:00.000Z', committedWpm: 200, correct: 4, score: 800, passed: true, cleanSweep: true }),
    round({ completedAt: '2026-08-21T10:00:00.000Z', committedWpm: 200, correct: 3, score: 600, passed: true, cleanSweep: false }),
    round({ completedAt: '2026-08-22T10:00:00.000Z', committedWpm: 600, correct: 1, score: 600, passed: false, cleanSweep: false }),
    round({ completedAt: '2026-08-23T10:00:00.000Z', committedWpm: 400, correct: 4, score: 2_400, passed: true, cleanSweep: true }),
  ];

  it('adds every round into the lifetime total', () => {
    expect(totalPoints(rounds)).toBe(4_400);
  });

  it('counts the streak back from the most recent round only', () => {
    expect(currentStreak(rounds)).toBe(1);
    expect(bestStreak(rounds)).toBe(2);
  });

  it('reports the fastest clean sweep as the number to beat', () => {
    expect(bestCleanSpeed(rounds)).toBe(400);
    expect(bestCleanSpeed([])).toBeNull();
  });

  it('summarises accuracy for each tier', () => {
    expect(recordForWpm(rounds, 200)).toMatchObject({ rounds: 2, correct: 7, questions: 8, accuracy: 88 });
    expect(recordForWpm(rounds, 750)).toMatchObject({ rounds: 0, accuracy: null });
  });

  it('will not crown a ceiling from a single unrepeated result', () => {
    // 400 wpm is perfect but played once; 200 wpm is proven twice.
    expect(reliableCeiling(rounds)?.tier.wpm).toBe(200);
  });

  it('has no ceiling before anything has been played', () => {
    expect(reliableCeiling([])).toBeNull();
  });
});

describe('reading estimates', () => {
  it('turns a word count and speed into a clock', () => {
    expect(estimatedSeconds(600, 300)).toBe(120);
    expect(formatClock(120)).toBe('2:00');
    expect(formatClock(95)).toBe('1:35');
  });
});
