import type { ArticleContent, ReadingLine } from '../types';

const JUNK_PATTERNS = [
  /^(advertisement|sponsored|promoted)$/i,
  /^(share|save|print|copy link|read more|learn more)$/i,
  /^(sign in|log in|register|subscribe|newsletter)$/i,
  /^(related|recommended|more from|you may also like)(\s.+)?$/i,
  /^(accept|reject|manage) (all )?cookies?$/i,
  /all rights reserved/i,
  /privacy policy|terms of (use|service)/i,
  /follow us on/i,
];

/**
 * Everything from one of these headings onward is apparatus rather than
 * article: link lists, citations, and reading suggestions. A speed reader who
 * reaches them spends minutes advancing one bibliography entry at a time.
 */
const END_MATTER_HEADING =
  /^(references?|notes?( and references?)?|footnotes?|citations?|sources?|bibliography|further reading|external links?|see also|works cited|explanatory notes|general references|related pages|navigation menu)$/i;

/** A reference-list entry that survived without its container. */
const ORPHAN_REFERENCE = /^[↑^]\s/;

const CITATION_MARKER = /\s*\[(?:\d{1,4}|[a-z]|[ivxlcdm]{1,6}|edit|citation needed|note \d+|nb \d+|clarification needed|who\?|when\?|why\?|sic)\]/gi;

export function stripReferenceMarkers(value: string): string {
  return value
    .replace(CITATION_MARKER, '')
    .replace(/\s+([,.;:!?)\]}])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function looksLikeHeading(value: string): boolean {
  return !/[.!?]["')\]]?$/.test(value) && value.split(/\s+/).filter(Boolean).length <= 6;
}

/**
 * Continuous prose is the only thing this reader can present well. Short
 * fragments are kept only when they read as section headings, which orient the
 * reader, and rejected when they look like a stray table cell or caption.
 */
export function readsAsProseOrHeading(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length >= 6) return true;
  if (/[.!?]["')\]]?$/.test(value)) return true; // a short but complete sentence
  if (/[,;:]$/.test(value)) return false; // a fragment cut out of a larger structure
  // Otherwise only a section heading earns a line: short, capitalised, unpunctuated.
  return /^[\p{Lu}\p{N}"']/u.test(value) && !/[|/]/.test(value);
}

export const SAMPLE_ARTICLE: ArticleContent = {
  title: 'A brief note on attention',
  byline: 'Built-in sample',
  siteName: 'speed-read',
  sourceUrl: null,
  paragraphs: [
    'Attention is not a switch that turns on when we decide to concentrate. It is closer to a small agreement we keep making with the thing in front of us.',
    'A stable page helps because the eyes can move without negotiating a moving target. The reading boundary marks when to continue while the text itself remains where it was placed.',
    'Pace matters, but only as a useful constraint. A pace that is slightly demanding can quiet the impulse to circle back over familiar words. A pace that is too fast turns reading into guessing.',
    'The useful measure is therefore personal. Can you stay with the argument, remember its shape, and finish more comfortably than you did before? Improvement begins with that honest comparison.',
    'This sample is long enough to try the controls. Use the arrow keys on a keyboard, or the controls at the bottom of a phone. Notice that the boundary advances while the page itself stays still.',
  ],
};

export function normalizeWhitespace(value: string): string {
  return value.replace(/[\t\f\v ]+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

export function isUsefulParagraph(value: string): boolean {
  const text = normalizeWhitespace(value);
  if (!text) return false;
  if (text.length < 24 && JUNK_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (text.length < 4) return false;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters / text.length < 0.45) return false;
  return !JUNK_PATTERNS.some((pattern) => text.length < 180 && pattern.test(text));
}

export function usefulParagraphs(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const text = stripReferenceMarkers(normalizeWhitespace(raw));
    if (END_MATTER_HEADING.test(text)) break;
    if (ORPHAN_REFERENCE.test(text)) continue;
    const key = text.toLocaleLowerCase();
    if (!isUsefulParagraph(text) || !readsAsProseOrHeading(text) || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  // A heading whose body was removed as non-prose announces a section that is
  // no longer there, so drop any heading left with nothing after it.
  while (result.length > 0 && looksLikeHeading(result[result.length - 1])) result.pop();
  return result;
}

/**
 * Page titles usually carry the site name as a suffix. The reader shows the
 * title on the start gate and in the article log, where "Jordan Wynter"
 * belongs and "Jordan Wynter - Wikipedia" does not.
 */
export function cleanTitle(title: string, siteName?: string | null): string {
  const text = normalizeWhitespace(title);
  const suffix = normalizeWhitespace(siteName ?? '');
  const candidates = suffix ? [suffix, 'Wikipedia'] : ['Wikipedia'];
  for (const candidate of candidates) {
    const pattern = new RegExp(`\\s*[-–—|·:]\\s*${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
    const trimmed = text.replace(pattern, '');
    if (trimmed && trimmed !== text) return trimmed;
  }
  return text;
}

export function pastedTextToArticle(raw: string): ArticleContent {
  const withoutMarkup = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?(?:p|div|article|section|h[1-6]|blockquote|li|br)\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  let paragraphs = usefulParagraphs(withoutMarkup.split(/\n\s*\n+/));
  if (paragraphs.length === 0) {
    paragraphs = usefulParagraphs(withoutMarkup.split(/(?<=[.!?])\s+(?=[A-Z\p{Lu}])/u));
  }

  const first = paragraphs[0] ?? '';
  const firstLooksLikeTitle = first.length > 3 && first.length < 90 && !/[.!?]$/.test(first);
  const title = firstLooksLikeTitle ? first : 'Pasted text';
  if (firstLooksLikeTitle && paragraphs.length > 1) paragraphs = paragraphs.slice(1);

  return {
    title,
    byline: null,
    siteName: null,
    sourceUrl: null,
    paragraphs,
  };
}

/**
 * A round should take a comparable amount of time whatever article turns up,
 * so a long article is cut to whole paragraphs up to a word budget. Score does
 * not scale with length, and a thirteen-minute round pays no more than a
 * three-minute one, so players would otherwise just reroll anything long.
 */
export function roundExcerpt(paragraphs: string[], maxWords: number): string[] {
  const excerpt: string[] = [];
  let used = 0;
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean).length;
    if (excerpt.length > 0 && used + words > maxWords) break;
    excerpt.push(paragraph);
    used += words;
    if (used >= maxWords) break;
  }
  return excerpt;
}

export function countWords(paragraphs: string[]): number {
  return paragraphs.reduce((total, paragraph) => total + paragraph.split(/\s+/).filter(Boolean).length, 0);
}

export function wrapParagraphs(
  paragraphs: string[],
  maxWidth: number,
  measure: (text: string) => number,
): ReadingLine[] {
  if (maxWidth <= 0) return [];
  const lines: ReadingLine[] = [];
  let globalWord = 0;

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = normalizeWhitespace(paragraph).split(/\s+/).filter(Boolean);
    let lineWords: string[] = [];
    let lineStart = globalWord;

    const pushLine = () => {
      if (lineWords.length === 0) return;
      lines.push({
        id: `${paragraphIndex}-${lineStart}`,
        text: lineWords.join(' '),
        startWord: lineStart,
        endWord: lineStart + lineWords.length,
        paragraphStart: lineStart === globalWord,
      });
      lineStart += lineWords.length;
      lineWords = [];
    };

    for (const word of words) {
      const candidate = lineWords.length === 0 ? word : `${lineWords.join(' ')} ${word}`;
      if (lineWords.length > 0 && measure(candidate) > maxWidth) pushLine();
      lineWords.push(word);
    }
    pushLine();
    globalWord += words.length;
  });

  return lines;
}

export function fallbackWrap(paragraphs: string[], characters = 62): ReadingLine[] {
  return wrapParagraphs(paragraphs, characters, (text) => text.length);
}
