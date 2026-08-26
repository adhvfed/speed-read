import type { ReadingQuiz } from '../types';

export const QUIZ_QUESTION_COUNT = 4;
export const MAX_QUIZ_SOURCE_CHARS = 16_000;

function cleanSlice(value: string): string {
  return value
    .replace(/^\S+\s/, '')
    .replace(/\s\S+$/, '')
    .trim();
}

export function buildQuizExcerpt(paragraphs: string[], maxChars = MAX_QUIZ_SOURCE_CHARS): string {
  const text = paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean).join('\n\n');
  if (text.length <= maxChars) return text;

  const separator = '\n\n[…]\n\n';
  const chunkLength = Math.floor((maxChars - separator.length * 2) / 3);
  const middleStart = Math.max(0, Math.floor((text.length - chunkLength) / 2));
  const chunks = [
    text.slice(0, chunkLength).replace(/\s\S+$/, '').trim(),
    cleanSlice(text.slice(middleStart, middleStart + chunkLength)),
    text.slice(-chunkLength).replace(/^\S+\s/, '').trim(),
  ];
  return chunks.join(separator).slice(0, maxChars);
}

export function isReadingQuiz(value: unknown): value is ReadingQuiz {
  if (!value || typeof value !== 'object') return false;
  const questions = (value as { questions?: unknown }).questions;
  if (!Array.isArray(questions) || questions.length !== QUIZ_QUESTION_COUNT) return false;

  return questions.every((question) => {
    if (!question || typeof question !== 'object') return false;
    const candidate = question as Record<string, unknown>;
    return (
      typeof candidate.prompt === 'string' && candidate.prompt.trim().length > 0 && candidate.prompt.length <= 500 &&
      Array.isArray(candidate.choices) && candidate.choices.length === 4 &&
      candidate.choices.every((choice) => typeof choice === 'string' && choice.trim().length > 0 && choice.length <= 300) &&
      Number.isInteger(candidate.correctIndex) && Number(candidate.correctIndex) >= 0 && Number(candidate.correctIndex) <= 3 &&
      typeof candidate.explanation === 'string' && candidate.explanation.trim().length > 0 && candidate.explanation.length <= 700
    );
  });
}

export function scoreQuiz(quiz: ReadingQuiz, answers: Record<number, number>): number {
  return quiz.questions.reduce(
    (score, question, index) => score + (answers[index] === question.correctIndex ? 1 : 0),
    0,
  );
}
