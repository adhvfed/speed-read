import type { CompletedSession, GameRound } from '../types';
import { isReadingQuiz, scoreQuiz } from './quiz';

const STORAGE_KEY = 'speed-read:sessions:v1';
const PACE_KEY = 'speed-read:wpm';
const ROUNDS_KEY = 'wikispreed:rounds:v1';
const TIER_KEY = 'wikispreed:tier:v1';
const MAX_ROUNDS = 200;

function isCompletedSession(value: unknown): value is CompletedSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Record<string, unknown>;
  const baseValid = (
    typeof session.id === 'string' &&
    typeof session.title === 'string' &&
    (typeof session.sourceUrl === 'string' || session.sourceUrl === null) &&
    ['wikipedia', 'url', 'text', 'sample'].includes(String(session.sourceType)) &&
    ['wordCount', 'durationSeconds', 'startWpm', 'endWpm', 'totalLines'].every(
      (key) => typeof session[key] === 'number' && Number.isFinite(session[key]),
    ) &&
    typeof session.startedAt === 'string' &&
    typeof session.completedAt === 'string' &&
    (session.articleId === undefined || typeof session.articleId === 'string') &&
    (session.measuredWpm === undefined || (typeof session.measuredWpm === 'number' && Number.isFinite(session.measuredWpm) && session.measuredWpm > 0)) &&
    (session.quiz === undefined || isReadingQuiz(session.quiz))
  );
  if (!baseValid) return false;

  const hasResult = session.quizScore !== undefined || session.quizTotal !== undefined || session.quizAnswers !== undefined;
  if (!hasResult) return true;
  if (!isReadingQuiz(session.quiz) || !Array.isArray(session.quizAnswers) || session.quizAnswers.length !== session.quiz.questions.length) return false;
  if (!session.quizAnswers.every((answer) => Number.isInteger(answer) && Number(answer) >= 0 && Number(answer) <= 3)) return false;
  if (session.quizTotal !== session.quiz.questions.length || typeof session.quizScore !== 'number' || !Number.isInteger(session.quizScore)) return false;
  const answers = Object.fromEntries(session.quizAnswers.map((answer, index) => [index, Number(answer)]));
  return session.quizScore === scoreQuiz(session.quiz, answers);
}

export function loadLocalSessions(): CompletedSession[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCompletedSession).slice(0, 100);
  } catch {
    return [];
  }
}

export function saveLocalSession(session: CompletedSession): void {
  try {
    const sessions = loadLocalSessions().filter((item) => item.id !== session.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([session, ...sessions].slice(0, 100)));
  } catch {
    // The completed session remains in memory when browser storage is unavailable.
  }
}

export function loadLocalPace(fallback = 250): number {
  try {
    const value = Number(localStorage.getItem(PACE_KEY));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveLocalPace(wpm: number): void {
  try {
    localStorage.setItem(PACE_KEY, String(wpm));
  } catch {
    // Reading still works when storage is disabled or full.
  }
}


function isGameRound(value: unknown): value is GameRound {
  if (!value || typeof value !== 'object') return false;
  const round = value as Record<string, unknown>;
  const numbers = ['wordCount', 'committedWpm', 'durationSeconds', 'correct', 'questions', 'score', 'streakBefore'];
  if (!numbers.every((key) => typeof round[key] === 'number' && Number.isFinite(round[key]))) return false;
  if (typeof round.id !== 'string' || typeof round.title !== 'string') return false;
  if (typeof round.sourceUrl !== 'string' && round.sourceUrl !== null) return false;
  if (typeof round.startedAt !== 'string' || typeof round.completedAt !== 'string') return false;
  if (typeof round.passed !== 'boolean' || typeof round.cleanSweep !== 'boolean') return false;
  if (round.articleId !== undefined && typeof round.articleId !== 'string') return false;
  if (round.quiz !== undefined && !isReadingQuiz(round.quiz)) return false;
  if (round.quizAnswers !== undefined) {
    if (!Array.isArray(round.quizAnswers)) return false;
    if (!round.quizAnswers.every((answer) => Number.isInteger(answer) && Number(answer) >= 0 && Number(answer) <= 3)) return false;
  }
  // A round's score has to follow from its own answers, so an edited record
  // cannot inflate a rank.
  if (isReadingQuiz(round.quiz) && Array.isArray(round.quizAnswers)) {
    const answers = Object.fromEntries(round.quizAnswers.map((answer, index) => [index, Number(answer)]));
    if (scoreQuiz(round.quiz, answers) !== round.correct) return false;
  }
  return true;
}

export function loadRounds(): GameRound[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUNDS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isGameRound).slice(0, MAX_ROUNDS);
  } catch {
    return [];
  }
}

export function saveRound(round: GameRound): void {
  try {
    const rounds = loadRounds().filter((item) => item.id !== round.id);
    localStorage.setItem(ROUNDS_KEY, JSON.stringify([round, ...rounds].slice(0, MAX_ROUNDS)));
  } catch {
    // The round stays in memory when browser storage is unavailable.
  }
}

export function loadPreferredTier(fallback: string): string {
  try {
    return localStorage.getItem(TIER_KEY) || fallback;
  } catch {
    return fallback;
  }
}

export function savePreferredTier(id: string): void {
  try {
    localStorage.setItem(TIER_KEY, id);
  } catch {
    // Tier choice simply is not remembered when storage is unavailable.
  }
}
