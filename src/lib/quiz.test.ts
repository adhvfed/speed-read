import { describe, expect, it } from 'vitest';
import { buildQuizExcerpt, isReadingQuiz, randomizeQuizChoices, scoreQuiz } from './quiz';

const quiz = {
  questions: Array.from({ length: 4 }, (_, index) => ({
    prompt: `Question ${index + 1}?`,
    choices: ['One', 'Two', 'Three', 'Four'],
    correctIndex: index % 4,
    explanation: 'The reading supports this answer.',
  })),
};

describe('reading quizzes', () => {
  it('samples long text across its beginning, middle, and end', () => {
    const text = `${'beginning '.repeat(1_000)}${'middle '.repeat(1_000)}${'ending '.repeat(1_000)}`;
    const excerpt = buildQuizExcerpt([text], 900);
    expect(excerpt.length).toBeLessThanOrEqual(900);
    expect(excerpt).toContain('beginning');
    expect(excerpt).toContain('middle');
    expect(excerpt).toContain('ending');
  });

  it('validates and scores a four-question quiz', () => {
    expect(isReadingQuiz(quiz)).toBe(true);
    expect(scoreQuiz(quiz, { 0: 0, 1: 1, 2: 0, 3: 3 })).toBe(3);
    expect(isReadingQuiz({ questions: quiz.questions.slice(0, 3) })).toBe(false);
  });

  it('randomizes every answer set without changing which answer is correct', () => {
    const randomized = randomizeQuizChoices(quiz, () => 0);

    expect(randomized).not.toBe(quiz);
    randomized.questions.forEach((question, index) => {
      const original = quiz.questions[index];
      expect(question.choices).toEqual(['Two', 'Three', 'Four', 'One']);
      expect(question.choices[question.correctIndex]).toBe(original.choices[original.correctIndex]);
      expect(question.explanation).toBe(original.explanation);
    });
    expect(quiz.questions[0].choices).toEqual(['One', 'Two', 'Three', 'Four']);
  });
});
