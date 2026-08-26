export type HashRoute =
  | { view: 'home' }
  | { view: 'history' }
  | { view: 'quiz'; sessionId: string }
  | { view: 'reader'; articleId: string; word: number };

export function parseHashRoute(hash: string): HashRoute {
  if (hash === '#progress') return { view: 'history' };
  const quizMatch = hash.match(/^#quiz\/([a-z0-9-]{8,100})$/i);
  if (quizMatch) return { view: 'quiz', sessionId: quizMatch[1] };
  const match = hash.match(/^#read\/([a-f0-9]{16,64})(?:\/(\d+))?$/i);
  if (!match) return { view: 'home' };
  const word = Number(match[2] ?? 0);
  return { view: 'reader', articleId: match[1].toLowerCase(), word: Number.isSafeInteger(word) ? word : 0 };
}

export function quizHash(sessionId: string): string {
  return `#quiz/${sessionId}`;
}

export function readerHash(articleId: string, word = 0): string {
  return `#read/${articleId}/${Math.max(0, Math.floor(word))}`;
}
