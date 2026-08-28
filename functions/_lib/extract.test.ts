import { describe, expect, it } from 'vitest';
import { extractUsefulArticle, extractUsefulArticleWithAudit, isBlockedUrl, WIKIPEDIA_CLEANER_VERSION } from './extract';

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

  it('uses the continuous-prose Wikipedia profile and reports what it removed', () => {
    const repeated = 'This deliberately long paragraph appears twice in responsive markup and should only survive once in the reading copy.';
    const { article, audit } = extractUsefulArticleWithAudit(
      `<!doctype html><html><head>
        <title>Fixture article - Wikipedia</title>
        <meta property="og:site_name" content="Wikipedia">
      </head><body><div id="mw-content-text"><div class="mw-parser-output">
        <table class="infobox"><tr><th>Born</th><td>1901</td></tr></table>
        <figure><figcaption>A contextless image caption.</figcaption></figure>
        <p>The <a>first linked phrase</a><a>second linked phrase</a> introduces enough useful prose for a complete speed-reading article.</p>
        <p>${repeated}</p><p>${repeated}</p>
        <div class="mw-heading mw-heading2"><h2>History</h2><span class="mw-editsection">[edit]</span></div>
        <p>The history remains useful, including a canonical location at <span class="geo-inline"><span class="geo-nondefault">23°26′32″N 88°26′36″E</span><span class="geo-multi-punct"> / </span><span class="geo-dec">23.442333°N 88.443389°E</span></span>.</p>
        <ul><li>Short label</li><li>This complete list sentence carries useful context and remains readable.</li></ul>
        <p>The area has two named districts:</p><ul><li>North district</li><li>South district</li></ul>
        <p>Note: The map alongside presents linked places in the larger full screen map.</p>
        <table class="wikitable"><tr><th>Year</th><td>1901</td></tr></table>
        <div class="mw-heading mw-heading2"><h2>External links and additional sources</h2></div>
        <p>This source appendix contains enough words to look like prose but should still be removed from a reading round.</p>
      </div></div></body></html>`,
      'https://en.wikipedia.org/wiki/Fixture_article',
    );

    const text = article.paragraphs.join('\n');
    expect(article.title).toBe('Fixture article');
    expect(text).toContain('first linked phrase second linked phrase');
    expect(text.match(/deliberately long paragraph/g)).toHaveLength(1);
    expect(text).toContain('23.442333°N, 88.443389°E');
    expect(text).toContain('This complete list sentence');
    expect(text).toContain('The area has two named districts: North district; South district.');
    expect(text).not.toContain('Short label');
    expect(text).not.toContain('Born');
    expect(text).not.toContain('contextless image caption');
    expect(text).not.toContain('full screen map');
    expect(text).not.toContain('source appendix');
    expect(audit).toMatchObject({
      cleanerVersion: WIKIPEDIA_CLEANER_VERSION,
      extractionProfile: 'wikipedia-continuous-prose',
      coordinatesCanonicalized: 1,
      mapNotesRemoved: 1,
      removedSections: ['External links and additional sources'],
    });
    expect(audit.elementRules).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: 'table', elementsRemoved: 2 }),
      expect.objectContaining({ selector: 'figure', elementsRemoved: 1 }),
    ]));
  });
});
