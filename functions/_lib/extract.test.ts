import { describe, expect, it } from 'vitest';
import { extractUsefulArticle, isBlockedUrl } from './extract';

describe('article extraction', () => {
  it('blocks private network targets', () => {
    expect(isBlockedUrl('http://127.0.0.1/private')).toBe(true);
    expect(isBlockedUrl('http://192.168.1.2/private')).toBe(true);
    expect(isBlockedUrl('http://[::]/private')).toBe(true);
    expect(isBlockedUrl('http://[::1]/private')).toBe(true);
    expect(isBlockedUrl('http://[fc00::1]/private')).toBe(true);
    expect(isBlockedUrl('http://[fe80::1]/private')).toBe(true);
    expect(isBlockedUrl('http://[::ffff:127.0.0.1]/private')).toBe(true);
    expect(isBlockedUrl('https://example.com/article')).toBe(false);
    expect(isBlockedUrl('https://[2606:4700:4700::1111]/article')).toBe(false);
  });

  it('keeps article copy and drops navigation and subscription furniture', () => {
    const article = extractUsefulArticle(
      `<!doctype html><html><head><title>A clear title</title></head><body>
        <nav>Home About Subscribe</nav>
        <article><p>This opening paragraph contains enough useful words to establish the subject of the article clearly.</p>
        <p>The second paragraph develops the argument with several more sentences for a reader to follow carefully.</p></article>
        <footer>Privacy policy</footer></body></html>`,
      'https://example.com/clear-title',
    );
    expect(article.title).toBe('A clear title');
    expect(article.paragraphs.join(' ')).toContain('opening paragraph');
    expect(article.paragraphs.join(' ')).not.toContain('Privacy policy');
  });
});
