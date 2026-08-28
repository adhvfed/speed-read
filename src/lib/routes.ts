export type HashRoute =
  | { view: 'home' }
  | { view: 'progress' }
  | { view: 'score'; roundId: string }
  | { view: 'round'; articleId: string };

export function parseHashRoute(hash: string): HashRoute {
  if (hash === '#progress') return { view: 'progress' };
  const scoreMatch = hash.match(/^#score\/([a-z0-9-]{8,100})$/i);
  if (scoreMatch) return { view: 'score', roundId: scoreMatch[1] };
  const roundMatch = hash.match(/^#round\/([a-f0-9]{16,64})$/i);
  if (roundMatch) return { view: 'round', articleId: roundMatch[1].toLowerCase() };
  return { view: 'home' };
}

export function scoreHash(roundId: string): string {
  return `#score/${roundId}`;
}

export function roundHash(articleId: string): string {
  return `#round/${articleId}`;
}
