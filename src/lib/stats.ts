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

export function accuracyBySpeed(sessions: CompletedSession[]): AccuracyBand[] {
  const grouped = new Map<number, Omit<AccuracyBand, 'minWpm' | 'maxWpm' | 'label' | 'accuracy'>>();

  for (const session of sessions) {
    if (session.quizScore === undefined || !session.quizTotal) continue;
    const measuredWpm = session.measuredWpm ?? session.endWpm;
    const minWpm = Math.floor(measuredWpm / 100) * 100;
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
      label: `${minWpm}–${minWpm + 99}`,
      ...result,
      accuracy: Math.round((result.correct / result.total) * 100),
    }));
}
