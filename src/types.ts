export interface ArticleContent {
  title: string;
  byline: string | null;
  siteName: string | null;
  sourceUrl: string | null;
  paragraphs: string[];
}

export interface ReadingLine {
  id: string;
  text: string;
  startWord: number;
  endWord: number;
  paragraphStart: boolean;
}

export interface QuizQuestion {
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
}

export interface ReadingQuiz {
  questions: QuizQuestion[];
}

/**
 * One played round of WikiSpreed: an article, the speed the player committed
 * to before reading it, and how that bet turned out.
 */
export interface GameRound {
  id: string;
  title: string;
  sourceUrl: string | null;
  articleId?: string;
  wordCount: number;
  committedWpm: number;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  /** Present once the recall check has been generated. */
  quiz?: ReadingQuiz;
  quizAnswers?: number[];
  /** Scoring fields are written together when the quiz is submitted. */
  correct: number;
  questions: number;
  score: number;
  passed: boolean;
  cleanSweep: boolean;
  streakBefore: number;
}

export interface CompletedSession {
  id: string;
  title: string;
  sourceUrl: string | null;
  sourceType: 'wikipedia' | 'url' | 'text' | 'sample';
  wordCount: number;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  startWpm: number;
  endWpm: number;
  measuredWpm?: number;
  totalLines: number;
  articleId?: string;
  quiz?: ReadingQuiz;
  quizAnswers?: number[];
  quizScore?: number;
  quizTotal?: number;
}

export type StoredArticleSource = CompletedSession['sourceType'];

export interface StoredArticle {
  id: string;
  article: ArticleContent;
  sourceType: StoredArticleSource;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  estimatedBytes: number;
}
