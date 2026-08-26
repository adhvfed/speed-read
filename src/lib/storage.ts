import type { CompletedSession } from '../types';
import { isReadingQuiz, scoreQuiz } from './quiz';

const STORAGE_KEY = 'speed-read:sessions:v1';
const PACE_KEY = 'speed-read:wpm';

function isCompletedSession(value: unknown): value is CompletedSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Record<string, unknown>;
  const baseValid = (
    typeof session.id === 'string' &&
    typeof session.title === 'string' &&
    (typeof session.sourceUrl === 'string' || session.sourceUrl === null) &&
    ['url', 'text', 'sample'].includes(String(session.sourceType)) &&
    ['wordCount', 'durationSeconds', 'startWpm', 'endWpm', 'totalLines'].every(
      (key) => typeof session[key] === 'number' && Number.isFinite(session[key]),
    ) &&
    typeof session.startedAt === 'string' &&
    typeof session.completedAt === 'string' &&
    (session.articleId === undefined || typeof session.articleId === 'string') &&
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
