import type { GameRound } from '../types';

/**
 * WikiSpreed is a wager. Before a round begins the player commits to a reading
 * speed and cannot change it, so the speed is a bet on their own comprehension
 * rather than a dial to retreat behind. Everything in this module exists to
 * make that bet legible: what it pays, what it costs, and how it has gone.
 */

export interface SpeedTier {
  id: string;
  name: string;
  wpm: number;
}

/** The ladder is a risk ladder, so each tier carries a heat colour. */
export function tierColorVar(tier: SpeedTier): string {
  return `var(--tier-${tier.id})`;
}

/**
 * Discrete tiers rather than a continuous slider. Six buckets concentrate a
 * player's history enough that "how do I do at this speed" is answerable after
 * a handful of rounds; fifty buckets would never fill.
 */
export const SPEED_TIERS: readonly SpeedTier[] = [
  { id: 'cruise', name: 'Cruise', wpm: 200 },
  { id: 'brisk', name: 'Brisk', wpm: 300 },
  { id: 'quick', name: 'Quick', wpm: 400 },
  { id: 'sprint', name: 'Sprint', wpm: 500 },
  { id: 'blitz', name: 'Blitz', wpm: 600 },
  { id: 'reckless', name: 'Reckless', wpm: 750 },
];

export const DEFAULT_TIER_ID = 'brisk';

export function tierForWpm(wpm: number): SpeedTier {
  return SPEED_TIERS.find((tier) => tier.wpm === wpm)
    ?? SPEED_TIERS.reduce((closest, tier) => (
      Math.abs(tier.wpm - wpm) < Math.abs(closest.wpm - wpm) ? tier : closest
    ));
}

export function tierById(id: string): SpeedTier {
  return SPEED_TIERS.find((tier) => tier.id === id) ?? tierForWpm(300);
}

/** The payout multiplier a tier advertises. 300 wpm pays triple, 750 pays 7.5x. */
export function speedMultiplier(wpm: number): number {
  return wpm / 100;
}

/** What a perfect four-question round is worth at a given speed, before any
 *  streak bonus. The bet screen quotes this so the wager is concrete. */
export function cleanSweepPayout(wpm: number, questions = 4): number {
  return Math.round(questions * wpm * 1.5);
}

/** Three of four. Below this the round breaks a streak. */
export const PASS_RATIO = 0.75;
const CLEAN_SWEEP_MULTIPLIER = 1.5;
const STREAK_STEP = 0.1;
const MAX_STREAK_MULTIPLIER = 2;

export interface ScoreBreakdown {
  base: number;
  cleanSweep: boolean;
  cleanSweepBonus: number;
  streak: number;
  streakMultiplier: number;
  streakBonus: number;
  total: number;
  passed: boolean;
}

export interface ScoreInput {
  correct: number;
  total: number;
  wpm: number;
  /** Consecutive passes *before* this round. */
  streak: number;
}

/**
 * Base pay is correct answers times committed speed, which makes the wager
 * honest: two right at 600 pays the same as four right at 300. The clean-sweep
 * bonus is what tips the incentive back toward actually understanding the
 * article rather than gambling on a coin flip at reckless pace.
 */
export function scoreRound({ correct, total, wpm, streak }: ScoreInput): ScoreBreakdown {
  const base = correct * wpm;
  const cleanSweep = total > 0 && correct === total;
  const afterSweep = cleanSweep ? base * CLEAN_SWEEP_MULTIPLIER : base;
  const streakMultiplier = Math.min(1 + streak * STREAK_STEP, MAX_STREAK_MULTIPLIER);
  const withStreak = Math.round(afterSweep * streakMultiplier);
  return {
    base,
    cleanSweep,
    cleanSweepBonus: afterSweep - base,
    streak,
    streakMultiplier,
    streakBonus: withStreak - afterSweep,
    total: withStreak,
    passed: total > 0 && correct / total >= PASS_RATIO,
  };
}

export interface Rank {
  name: string;
  points: number;
}

export const RANKS: readonly Rank[] = [
  { name: 'Rookie', points: 0 },
  { name: 'Skimmer', points: 2_500 },
  { name: 'Scanner', points: 7_500 },
  { name: 'Reader', points: 15_000 },
  { name: 'Speed Reader', points: 30_000 },
  { name: 'Page Burner', points: 60_000 },
  { name: 'Wikivore', points: 120_000 },
];

export interface RankProgress {
  current: Rank;
  next: Rank | null;
  /** 0 to 1 through the current rank; 1 once the ladder is topped out. */
  fraction: number;
  pointsIntoRank: number;
  pointsNeeded: number;
}

export function rankFor(points: number): RankProgress {
  let index = 0;
  for (let candidate = 0; candidate < RANKS.length; candidate += 1) {
    if (points >= RANKS[candidate].points) index = candidate;
  }
  const current = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  if (!next) {
    return { current, next: null, fraction: 1, pointsIntoRank: points - current.points, pointsNeeded: 0 };
  }
  const span = next.points - current.points;
  const into = points - current.points;
  return {
    current,
    next,
    fraction: Math.max(0, Math.min(1, into / span)),
    pointsIntoRank: into,
    pointsNeeded: span - into,
  };
}

function byNewestFirst(rounds: GameRound[]): GameRound[] {
  return [...rounds].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

export function totalPoints(rounds: GameRound[]): number {
  return rounds.reduce((sum, round) => sum + (round.score ?? 0), 0);
}

/** Consecutive passes counting back from the most recent round. */
export function currentStreak(rounds: GameRound[]): number {
  let streak = 0;
  for (const round of byNewestFirst(rounds)) {
    if (!round.passed) break;
    streak += 1;
  }
  return streak;
}

export function bestStreak(rounds: GameRound[]): number {
  let best = 0;
  let running = 0;
  for (const round of [...rounds].sort((a, b) => a.completedAt.localeCompare(b.completedAt))) {
    running = round.passed ? running + 1 : 0;
    best = Math.max(best, running);
  }
  return best;
}

/** The fastest tier the player has ever answered every question at. */
export function bestCleanSpeed(rounds: GameRound[]): number | null {
  const clean = rounds.filter((round) => round.cleanSweep).map((round) => round.committedWpm);
  return clean.length > 0 ? Math.max(...clean) : null;
}

export interface TierRecord {
  tier: SpeedTier;
  rounds: number;
  correct: number;
  questions: number;
  accuracy: number | null;
  cleanSweeps: number;
}

export function tierRecords(rounds: GameRound[]): TierRecord[] {
  return SPEED_TIERS.map((tier) => {
    const played = rounds.filter((round) => round.committedWpm === tier.wpm);
    const correct = played.reduce((sum, round) => sum + round.correct, 0);
    const questions = played.reduce((sum, round) => sum + round.questions, 0);
    return {
      tier,
      rounds: played.length,
      correct,
      questions,
      accuracy: questions > 0 ? Math.round((correct / questions) * 100) : null,
      cleanSweeps: played.filter((round) => round.cleanSweep).length,
    };
  });
}

export function recordForWpm(rounds: GameRound[], wpm: number): TierRecord | undefined {
  return tierRecords(rounds).find((record) => record.tier.wpm === wpm);
}

/**
 * The highest tier the player still comprehends reliably, which is the number
 * worth chasing. It needs two rounds before it will claim anything, so one
 * lucky result at Reckless does not crown a player who cannot repeat it.
 */
export function reliableCeiling(rounds: GameRound[]): TierRecord | null {
  const qualifying = tierRecords(rounds).filter(
    (record) => record.rounds >= 2 && record.accuracy !== null && record.accuracy >= PASS_RATIO * 100,
  );
  return qualifying.length > 0 ? qualifying[qualifying.length - 1] : null;
}

export function estimatedSeconds(words: number, wpm: number): number {
  return Math.round((words / Math.max(1, wpm)) * 60);
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}
