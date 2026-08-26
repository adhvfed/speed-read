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

export interface CompletedSession {
  id: string;
  title: string;
  sourceUrl: string | null;
  sourceType: 'url' | 'text' | 'sample';
  wordCount: number;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  startWpm: number;
  endWpm: number;
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
