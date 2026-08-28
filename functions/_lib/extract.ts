import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import type { ArticleContent } from '../../src/types';
import { cleanTitle, isEndMatterHeading, normalizeWhitespace, usefulParagraphs } from '../../src/lib/text.ts';

const MAX_HTML_BYTES = 2_000_000;
const ARTICLE_FETCH_CLIENT = 'speed-read/0.2 (https://github.com/adhvfed/speed-read)';
const MAX_REDIRECTS = 3;
export const WIKIPEDIA_CLEANER_VERSION = 3;
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

export interface ExtractionAudit {
  cleanerVersion: number;
  extractionProfile: 'wikipedia-continuous-prose' | 'generic-readability';
  removedSections: string[];
  elementRules: Array<{ selector: string; elementsRemoved: number; textCharactersRemoved: number }>;
  coordinatesCanonicalized: number;
  mapNotesRemoved: number;
  outputParagraphs: number;
}

export interface AuditedArticleContent {
  article: ArticleContent;
  audit: ExtractionAudit;
}

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
  querySelectorAll(selectors: string): ArrayLike<Element>;
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

function readableNodeText(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? '';
  if (node.nodeType !== 1) return '';
  const element = node as Element;
  if (element.tagName.toLowerCase() === 'br') return '\n';

  let output = '';
  let previousTag = '';
  for (const child of Array.from(element.childNodes)) {
    const part = readableNodeText(child);
    if (!part) continue;
    const currentTag = child.nodeType === 1 ? (child as Element).tagName.toLowerCase() : '';
    const needsSeparator = output.length > 0
      && !/[\s([{“‘/-]$/.test(output)
      && !/^[\s,.;:!?%)\]}’′″°/-]/.test(part);
    if (needsSeparator) {
      const listBoundary = previousTag === 'li' && currentTag === 'li';
      output += listBoundary ? '; ' : ' ';
    }
    output += part;
    previousTag = currentTag;
  }

  return output
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/\s+([,.;:!?%)\]}’′″°])/g, '$1')
    .replace(/([([{“‘])\s+/g, '$1')
    .replace(/\s+(['’]s)\b/g, '$1')
    .replace(/\s+(['’])\s+s\b/g, '$1s')
    .replace(/(^|[\s([{])"\s+([^"\n]+?)\s+"(?=[\s,.;:!?)]|$)/g, '$1"$2"')
    .replace(/"([.!?])/g, '$1"')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function readableText(element: Element): string {
  return normalizeWhitespace(readableNodeText(element));
}

function listItemText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  for (const nested of Array.from(clone.querySelectorAll('ul, ol'))) nested.remove();
  return readableText(clone);
}

function finishInlineList(items: string[]): string {
  const text = items.map((item) => item.replace(/[.;,]+$/g, '').trim()).filter(Boolean).join('; ');
  return text && !/[.!?]$/.test(text) ? `${text}.` : text;
}

function collectParagraphs(root: QueryRoot): string[] {
  const paragraphs: string[] = [];
  const selectors = 'p, h2, h3, h4, blockquote, ul, ol';
  for (const element of Array.from(root.querySelectorAll(selectors))) {
    const tag = element.tagName.toLowerCase();
    if (tag === 'blockquote' && element.querySelector('p, blockquote, ul, ol')) continue;
    if (tag === 'p' && element.closest('li')) continue;
    if (tag === 'ul' || tag === 'ol') {
      if (element.parentElement?.closest('ul, ol')) continue;
      const items = Array.from(element.querySelectorAll('li'))
        .filter((item) => item.closest('ul, ol') === element)
        .map(listItemText)
        .filter(Boolean);
      const previous = paragraphs.at(-1) ?? '';
      const inline = items.length >= 1 && items.length <= 12 && items.join(' ').length <= 700 && /:$/.test(previous);
      if (inline) {
        paragraphs[paragraphs.length - 1] = `${previous} ${finishInlineList(items)}`;
      } else {
        paragraphs.push(...items.filter(listItemReadsAsProse));
      }
      continue;
    }
    const text = readableText(element);
    if (text) paragraphs.push(text);
  }
  return paragraphs;
}

function canonicalizeCoordinates(root: Element): number {
  let canonicalized = 0;
  for (const container of Array.from(root.querySelectorAll('.geo-inline, .coordinates'))) {
    const decimal = container.querySelector('.geo-dec');
    if (!decimal) continue;
    const text = readableText(decimal);
    if (!text) continue;
    const replacement = root.ownerDocument?.createTextNode(text.replace(/\s+/, ', '));
    if (!replacement) continue;
    container.replaceWith(replacement);
    canonicalized += 1;
  }
  return canonicalized;
}

function removeMapOnlyNotes(root: Element): number {
  let removed = 0;
  for (const paragraph of Array.from(root.querySelectorAll('p'))) {
    const text = readableText(paragraph);
    if (!/^note:\s+the map\b/i.test(text) || !/\b(?:map alongside|full screen map)\b/i.test(text)) continue;
    paragraph.remove();
    removed += 1;
  }
  return removed;
}

function topLevelHeadingBoundary(heading: Element): Element {
  const section = heading.closest('section[data-mw-section-id]');
  if (section) return section;
  const wrapper = heading.parentElement;
  if (wrapper?.classList.contains('mw-heading')) return wrapper;
  return heading;
}

function containsTopLevelHeading(element: Element): boolean {
  if (element.tagName.toLowerCase() === 'h2') return true;
  return Array.from(element.children).some((child) => child.tagName.toLowerCase() === 'h2');
}

function removeEndMatter(root: Element): string[] {
  const removed: string[] = [];
  for (const heading of Array.from(root.querySelectorAll('h2'))) {
    if (!heading.parentElement) continue;
    const text = readableText(heading).replace(/\[edit\]/gi, '').trim();
    if (!isEndMatterHeading(text)) continue;
    removed.push(text);
    const boundary = topLevelHeadingBoundary(heading);
    if (boundary.tagName.toLowerCase() === 'section') {
      boundary.remove();
      continue;
    }
    let current: Element | null = boundary;
    while (current) {
      const next: Element | null = current.nextElementSibling;
      current.remove();
      if (!next || containsTopLevelHeading(next)) break;
      current = next;
    }
  }
  return removed;
}

function removeNoiseElements(document: Document): ExtractionAudit['elementRules'] {
  const rules: ExtractionAudit['elementRules'] = [];
  for (const selector of REMOVE_SELECTORS) {
    const elements = Array.from(document.querySelectorAll(selector));
    let elementsRemoved = 0;
    let textCharactersRemoved = 0;
    for (const element of elements) {
      if (!element.parentElement) continue;
      textCharactersRemoved += normalizeWhitespace(element.textContent ?? '').length;
      element.remove();
      elementsRemoved += 1;
    }
    if (elementsRemoved > 0) rules.push({ selector, elementsRemoved, textCharactersRemoved });
  }
  return rules;
}

function findWikipediaRoot(document: Document, url: URL): Element | null {
  if (!/(^|\.)wikipedia\.org$/i.test(url.hostname)) return null;
  return document.querySelector('#mw-content-text .mw-parser-output')
    ?? Array.from(document.querySelectorAll('.mw-parser-output')).find((element) => element.querySelector('p, h2'))
    ?? null;
}

export function extractUsefulArticleWithAudit(html: string, value: string): AuditedArticleContent {
  const parsed = parseHTML(html);
  const document = parsed.document as unknown as Document;
  const url = new URL(value);

  const fallbackTitle =
    document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
    document.querySelector('title')?.textContent?.trim() ||
    url.hostname;
  const fallbackSite = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.trim() || null;

  const wikipediaRoot = findWikipediaRoot(document, url);
  if (wikipediaRoot) {
    const root = wikipediaRoot;
    const coordinatesCanonicalized = canonicalizeCoordinates(root);
    const mapNotesRemoved = removeMapOnlyNotes(root);
    const removedSections = removeEndMatter(root);
    const elementRules = removeNoiseElements(document);
    const paragraphs = usefulParagraphs(collectParagraphs(root));
    if (paragraphs.join(' ').length < 120) throw new Error('The page did not contain enough useful reading text.');
    return {
      article: {
        title: cleanTitle(fallbackTitle, fallbackSite || 'Wikipedia'),
        byline: null,
        siteName: fallbackSite || 'Wikipedia',
        sourceUrl: value,
        paragraphs,
      },
      audit: {
        cleanerVersion: WIKIPEDIA_CLEANER_VERSION,
        extractionProfile: 'wikipedia-continuous-prose',
        removedSections,
        elementRules,
        coordinatesCanonicalized,
        mapNotesRemoved,
        outputParagraphs: paragraphs.length,
      },
    };
  }

  const elementRules = removeNoiseElements(document);

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
    article: {
      title: cleanTitle(result?.title?.trim() || fallbackTitle, siteName),
      byline: result?.byline?.trim() || null,
      siteName,
      sourceUrl: value,
      paragraphs,
    },
    audit: {
      cleanerVersion: WIKIPEDIA_CLEANER_VERSION,
      extractionProfile: 'generic-readability',
      removedSections: [],
      elementRules,
      coordinatesCanonicalized: 0,
      mapNotesRemoved: 0,
      outputParagraphs: paragraphs.length,
    },
  };
}

export function extractUsefulArticle(html: string, url: string): ArticleContent {
  return extractUsefulArticleWithAudit(html, url).article;
}
