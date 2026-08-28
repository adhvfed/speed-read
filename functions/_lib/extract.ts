import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import type { ArticleContent } from '../../src/types';
import { cleanTitle, usefulParagraphs } from '../../src/lib/text';

const MAX_HTML_BYTES = 2_000_000;
const ARTICLE_FETCH_CLIENT = 'speed-read/0.2 (https://github.com/adhvfed/speed-read)';
const MAX_REDIRECTS = 3;
const REMOVE_SELECTORS = [
  'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe',
  'nav', 'aside', 'footer', 'form', 'dialog', '[role="navigation"]',
  '[role="complementary"]', '[aria-hidden="true"]',
  '.advertisement', '.ad', '.ads', '.cookie', '.newsletter', '.comments',
  '.related', '.recommended', '.social', '.share', '.promo',
  // Structures that carry facts but never continuous prose. A speed reader
  // advances one line at a time, so a table cell or a caption becomes a
  // one-word line with its own countdown rather than something to read.
  'table', 'figure', 'figcaption', 'aside', '[role="note"]', '.noprint',
  // English Wikipedia furniture, removed before Readability because
  // Readability strips the class names these rules depend on.
  '.reference', '.reflist', '.references', '.mw-references-wrap', '.mw-editsection',
  '.navbox', '.infobox', '.sidebar', '.metadata', '.hatnote', '.shortdescription',
  '.siteSub', '.mw-jump-link', '.toc', '#toc', '.thumb', '.thumbcaption', '.gallery',
  '.portal', '.sistersitebox', '.side-box', '.ambox', '.catlinks', '.printfooter',
  '.mw-file-description', '.mw-empty-elt', '.IPA', '.mw-authority-control',
];

function isBlockedIpv4(parts: number[]): boolean {
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function parseIpv6(hostname: string): number[] | null {
  if ((hostname.match(/::/g) ?? []).length > 1) return null;
  const compressed = hostname.includes('::');
  const [head = '', tail = ''] = hostname.split('::');
  const parseHalf = (half: string) => half ? half.split(':').map((part) => Number.parseInt(part, 16)) : [];
  const headParts = parseHalf(head);
  const tailParts = parseHalf(tail);
  const explicit = [...headParts, ...tailParts];
  if (explicit.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) return null;
  if (!compressed) return explicit.length === 8 ? explicit : null;
  const missing = 8 - explicit.length;
  if (missing < 1) return null;
  return [...headParts, ...Array<number>(missing).fill(0), ...tailParts];
}

function isBlockedIpv6(hostname: string): boolean {
  const parts = parseIpv6(hostname);
  if (!parts) return false;
  const [first, second] = parts;
  if (parts.every((part) => part === 0)) return true; // Unspecified ::
  if (parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1) return true; // Loopback ::1
  if ((first & 0xfe00) === 0xfc00) return true; // Unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0) return true; // Link/site local
  if ((first & 0xff00) === 0xff00) return true; // Multicast ff00::/8

  const mapped = parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff;
  const compatible = parts.slice(0, 6).every((part) => part === 0);
  if (mapped || compatible) {
    return isBlockedIpv4([parts[6] >> 8, parts[6] & 0xff, parts[7] >> 8, parts[7] & 0xff]);
  }

  // Translation and transition prefixes can carry an IPv4 destination in an
  // IPv6 literal. Reject them rather than risk a private IPv4 bypass.
  const translated = parts.slice(0, 4).every((part) => part === 0) && parts[4] === 0xffff && parts[5] === 0;
  const nat64 = first === 0x64 && second === 0xff9b;
  const teredoOrSixToFour = (first === 0x2001 && second === 0) || first === 0x2002;
  return translated || nat64 || teredoOrSixToFour;
}

export function isBlockedUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return true;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return true;
  if (url.port && !['80', '443'].includes(url.port)) return true;
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.home.arpa')) return true;
  if (hostname.includes(':')) return isBlockedIpv6(hostname);

  const ipv4 = hostname.split('.').map(Number);
  if (ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return isBlockedIpv4(ipv4);
  }
  return false;
}

async function readLimitedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_HTML_BYTES) throw new Error('That page is too large to prepare.');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error('That page is too large to prepare.');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function fetchPublicHtml(value: string, fetcher: typeof fetch = fetch): Promise<{ html: string; url: string }> {
  let current = new URL(value);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (isBlockedUrl(current.toString())) throw new Error('Private or local network addresses cannot be imported.');
    const response = await fetcher(current.toString(), {
      redirect: 'manual',
      headers: {
        accept: 'text/html, text/plain;q=0.9',
        'accept-encoding': 'gzip',
        // Wikimedia's User-Agent policy requires a means of contact, and every
        // Wikipedia roll makes one of these fetches. Keep it identical to the
        // identifier the Action API client sends.
        'user-agent': ARTICLE_FETCH_CLIENT,
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('The page redirected without a destination.');
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`The page returned ${response.status}. Try pasting its text instead.`);
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new Error('That link is not a readable HTML or text page.');
    }
    return { html: await readLimitedText(response), url: current.toString() };
  }
  throw new Error('The page redirected too many times.');
}

interface QueryRoot {
  querySelectorAll(selectors: string): ArrayLike<{ tagName?: string; textContent: string | null }>;
}

/**
 * List items are the main way reference lists, navigation boxes, and link
 * collections survive into an otherwise clean article, so a list item has to
 * look like a written sentence before it is treated as reading material.
 */
function listItemReadsAsProse(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length >= 8 && /[.!?]["')\]]?$/.test(text.trim());
}

function collectParagraphs(root: QueryRoot): string[] {
  const selectors = 'p, h2, h3, blockquote, li';
  return Array.from(root.querySelectorAll(selectors), (element) => {
    const text = element.textContent ?? '';
    const tag = (element.tagName ?? '').toLowerCase();
    if (tag === 'li' && !listItemReadsAsProse(text)) return '';
    return text;
  });
}

export function extractUsefulArticle(html: string, url: string): ArticleContent {
  const parsed = parseHTML(html);
  const document = parsed.document as unknown as Document;
  for (const selector of REMOVE_SELECTORS) {
    for (const element of Array.from(document.querySelectorAll(selector))) element.remove();
  }

  const fallbackTitle =
    document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
    document.querySelector('title')?.textContent?.trim() ||
    new URL(url).hostname;
  const fallbackSite = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.trim() || null;

  let result: ReturnType<Readability['parse']> = null;
  try {
    result = new Readability(document, {
      charThreshold: 120,
      maxElemsToParse: 20_000,
      nbTopCandidates: 7,
    }).parse();
  } catch {
    // Semantic fallback below handles pages that are not Readability-shaped.
  }

  let rawParagraphs: string[] = [];
  if (result?.content) {
    const articleDocument = parseHTML(result.content).document as unknown as Document;
    rawParagraphs = collectParagraphs(articleDocument);
  }
  if (rawParagraphs.length === 0 && result?.textContent) rawParagraphs = result.textContent.split(/\n+/);
  if (rawParagraphs.length === 0) {
    const semanticRoot = document.querySelector('article, main, [role="main"]') ?? document.body;
    rawParagraphs = collectParagraphs(semanticRoot);
  }

  const paragraphs = usefulParagraphs(rawParagraphs);
  if (paragraphs.join(' ').length < 120) throw new Error('The page did not contain enough useful reading text.');

  const siteName = result?.siteName?.trim() || fallbackSite;

  return {
    title: cleanTitle(result?.title?.trim() || fallbackTitle, siteName),
    byline: result?.byline?.trim() || null,
    siteName,
    sourceUrl: url,
    paragraphs,
  };
}
