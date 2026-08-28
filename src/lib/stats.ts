import type { CompletedSession } from '../types';

export interface AccuracyBand {
  minWpm: number;
  maxWpm: number;
  label: string;
  correct: number;
  total: number;
  reads: number;
  accuracy: number;
}

/**
 * The instrument's own pace ceiling. A reader who taps through lines can
 * produce an arbitrarily large words-per-minute figure, which is not a reading
 * measurement, so speeds are reported as "at or above the ceiling" instead.
 */
export const MAX_TRACKED_WPM = 800;

function bandLabel(minWpm: number): string {
  return minWpm >= MAX_TRACKED_WPM ? `${MAX_TRACKED_WPM}+` : `${minWpm}\u2013${minWpm + 99}`;
}

export function accuracyBySpeed(sessions: CompletedSession[]): AccuracyBand[] {
  const grouped = new Map<number, Omit<AccuracyBand, 'minWpm' | 'maxWpm' | 'label' | 'accuracy'>>();

  for (const session of sessions) {
    if (session.quizScore === undefined || !session.quizTotal) continue;
    const measuredWpm = session.measuredWpm ?? session.endWpm;
    const minWpm = Math.min(MAX_TRACKED_WPM, Math.floor(measuredWpm / 100) * 100);
    const current = grouped.get(minWpm) ?? { correct: 0, total: 0, reads: 0 };
    current.correct += session.quizScore;
    current.total += session.quizTotal;
    current.reads += 1;
    grouped.set(minWpm, current);
  }

  return [...grouped.entries()]
    .sort(([first], [second]) => first - second)
    .map(([minWpm, result]) => ({
      minWpm,
      maxWpm: minWpm + 99,
      label: bandLabel(minWpm),
      ...result,
      accuracy: Math.round((result.correct / result.total) * 100),
    }));
}
