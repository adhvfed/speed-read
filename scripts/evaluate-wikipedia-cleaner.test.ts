import { describe, expect, it } from 'vitest';
import {
  buildEvaluationRequest,
  cleanWikipediaHtml,
  parseOptions,
  summarizeEvaluations,
  validateEvaluation,
  type CleanedArticle,
} from './evaluate-wikipedia-cleaner.ts';

const page = {
  pageId: 42,
  title: 'Fixture article',
  url: 'https://en.wikipedia.org/wiki/Fixture_article',
};

const fixture = `
  <main>
    <div id="mw-content-text"><div class="mw-parser-output">
      <table class="infobox"><tr><th>Born</th><td>1901</td></tr></table>
      <figure><figcaption>A caption without its image is contextless.</figcaption></figure>
      <p>The lead explains the subject.<sup class="reference">[1]</sup></p>
      <p>The lead explains the subject.<sup class="reference">[1]</sup></p>
      <div class="mw-heading mw-heading2"><h2>History</h2><span class="mw-editsection">[edit]</span></div>
      <p>The history remains useful [citation needed].</p>
      <ul><li>The first useful event happened after several years of careful preparation.</li><li>The second useful event completed the project and changed its public direction.</li></ul>
      <table class="wikitable"><tr><th>Year</th><th>Result</th></tr><tr><td>1901</td><td>Founded</td></tr></table>
      <div class="mw-heading mw-heading2"><h2>Sources of power</h2><span class="mw-editsection">[edit]</span></div>
      <p>This substantive heading merely contains the word sources.</p>
      <div class="mw-heading mw-heading2"><h2>Notes on design</h2><span class="mw-editsection">[edit]</span></div>
      <p>This substantive heading merely contains the word notes.</p>
      <div class="mw-heading mw-heading2"><h2>References</h2><span class="mw-editsection">[edit]</span></div>
      <ol class="references"><li><span class="reference-text">Example source</span></li></ol>
      <table class="navbox"><tr><td>Unrelated navigation</td></tr></table>
    </div></div>
  </main>`;

describe('TypeScript Wikipedia cleaner evaluator', () => {
  it('evaluates the production continuous-prose extraction profile', () => {
    const article = cleanWikipediaHtml(page, fixture);

    expect(article.originalText).toContain('Table\n- Born — 1901');
    expect(article.cleanedText).not.toContain('Born — 1901');
    expect(article.cleanedText).not.toContain('caption without its image');
    expect(article.cleanedText).not.toContain('[1]');
    expect(article.cleanedText).not.toContain('[citation needed]');
    expect(article.cleanedText).not.toContain('## References');
    expect(article.cleanedText).not.toContain('Unrelated navigation');
    expect(article.cleanedText).toContain('The first useful event happened');
    expect(article.cleanedText).not.toContain('Year: 1901');
    expect(article.cleanedText).toContain('Sources of power');
    expect(article.cleanedText).toContain('Notes on design');
    expect(article.cleanedSections[0].fragments[0]).toBe('The lead explains the subject.');
    expect(article.audit.removedSections).toEqual([
      expect.objectContaining({ heading: 'References', rule: 'exact-boilerplate-heading' }),
    ]);
    expect(article.audit.extractionProfile).toBe('wikipedia-continuous-prose');
    expect(article.audit.elementRules.map((rule) => rule.rule)).toContain('table');
    expect(article.audit.elementRules.map((rule) => rule.rule)).toContain('figure');
  });

  it('removes long content tables as one unit while retaining neighboring prose', () => {
    const rows = Array.from({ length: 205 }, (_, index) => `<tr><td>Row ${index + 1}</td><td>Useful value</td></tr>`).join('');
    const article = cleanWikipediaHtml(page, `
      <div id="mw-content-text"><div class="mw-parser-output"><h2>Results</h2>
        <p>This paragraph explains what the results mean in enough detail for the reader to understand the surrounding section.</p>
        <table class="wikitable">${rows}</table>
        <p>This second paragraph continues the explanation after the removed tabular material and remains useful prose.</p>
      </div></div>`);
    expect(article.cleanedText).toContain('what the results mean');
    expect(article.cleanedText).toContain('continues the explanation');
    expect(article.cleanedText).not.toContain('Row 205');
  });

  it('deduplicates long section fragments and keeps one canonical coordinate form', () => {
    const repeated = 'This is a deliberately long substantive paragraph repeated by responsive source markup. '.repeat(3).trim();
    const article = cleanWikipediaHtml(page, `
      <div id="mw-content-text"><div class="mw-parser-output">
        <h2>Location</h2>
        <p>${repeated}</p>
        <p>A short paragraph separates the duplicated blocks.</p>
        <p>${repeated}</p>
        <p>The village is located in a broad agricultural valley at <span class="geo-inline"><span class="geo-nondefault">23°26′32″N 88°26′36″E</span><span class="geo-multi-punct"> / </span><span class="geo-default"><span class="geo-dec">23.442333°N 88.443389°E</span></span><span> / 23.442333; 88.443389</span></span>, near several historically important regional roads.</p>
        <p>Note: The map alongside presents linked places in the larger full screen map.</p>
      </div></div>`);

    expect(article.cleanedText.split(repeated)).toHaveLength(2);
    expect(article.cleanedText).toContain('23.442333°N, 88.443389°E');
    expect(article.cleanedText).not.toContain('23°26′32″N');
    expect(article.cleanedText).not.toContain('23.442333; 88.443389');
    expect(article.cleanedText).not.toContain('full screen map');
    expect(article.audit.coordinatesCanonicalized).toBe(1);
    expect(article.audit.mapNotesRemoved).toBe(1);
  });

  it('does not emit a blockquote container in addition to its child blocks', () => {
    const article = cleanWikipediaHtml(page, `
      <div id="mw-content-text"><div class="mw-parser-output"><h2>Quotation</h2>
        <p>This paragraph supplies enough surrounding context for the quotation and the production article minimum.</p>
        <blockquote><p>A long quotation appears once and supplies a complete thought for the reader to consider carefully.</p></blockquote>
      </div></div>`);
    expect(article.cleanedText.match(/A long quotation appears once/g)).toHaveLength(1);
  });

  it('preserves quotation content and repairs a misplaced closing quote', () => {
    const quote = 'A sufficiently long historical quotation appears here and ends with source punctuation".\nin Modern English:\nA readable modern translation appears here.';
    const article = cleanWikipediaHtml(page, `
      <div id="mw-content-text"><div class="mw-parser-output"><h2>Quotation</h2>
        <p>The source introduces a quotation:</p><blockquote><p>${quote}</p></blockquote>
      </div></div>`);
    expect(article.cleanedText).toContain('A sufficiently long historical quotation appears here and ends with source punctuation."');
    expect(article.cleanedText).toContain('A readable modern translation appears here.');
    expect(article.cleanedText).not.toContain('punctuation".');
  });

  it('preserves spaces between adjacent quoted phrases and normalizes possessives', () => {
    const article = cleanWikipediaHtml(page, `
      <div id="mw-content-text"><div class="mw-parser-output"><h2>Language</h2>
        <p>The roots for <i>"fire"</i> and <i>"white light"</i>, meaning <i>"Sun and Moon"</i> in Quenya, appear in the Elder Edda ' s account of " Waking of Angantyr ".</p>
      </div></div>`);
    expect(article.cleanedText).toContain('"fire" and "white light", meaning "Sun and Moon" in Quenya');
    expect(article.cleanedText).toContain("Elder Edda's account");
    expect(article.cleanedText).toContain('account of "Waking of Angantyr."');
  });

  it('sends bounded original and cleaned versions in a strict, stateless Luna request', () => {
    const article = cleanWikipediaHtml(page, fixture);
    const request = buildEvaluationRequest(article) as {
      model: string;
      store: boolean;
      input: string;
      text: { format: { strict: boolean; schema: { properties: Record<string, unknown> } } };
    };

    expect(request.model).toBe('gpt-5.6-luna');
    expect(request.store).toBe(false);
    expect(request).not.toHaveProperty('tools');
    expect(request.text.format.strict).toBe(true);
    expect(request.text.format.schema.properties).toHaveProperty('explanation');
    const input = JSON.parse(request.input);
    expect(input.article.original.text).toContain('## References');
    expect(input.article.cleaned.text).not.toContain('## References');
    expect(input.article.cleaned.text).not.toContain('Production reading output');
    expect(input.article.original.truncated).toBe(false);
  });

  it('requires an explanation and concrete corrections for every disagreement', () => {
    expect(validateEvaluation({ agrees: true, explanation: 'The cleanup is faithful.', disagreements: [] }).agrees).toBe(true);
    expect(() => validateEvaluation({ agrees: false, explanation: 'Content was lost.', disagreements: [] })).toThrow('without supplying a correction');
    expect(() => validateEvaluation({
      agrees: true,
      explanation: 'Mostly fine.',
      disagreements: [{
        category: 'noise_retained',
        severity: 'minor',
        location: 'Lead',
        evidence: 'A UI label remains.',
        correction: 'Remove that DOM class.',
      }],
    })).toThrow('agreed but also returned corrections');
  });

  it('aggregates pass ratios and individual corrections', () => {
    const article = cleanWikipediaHtml(page, fixture);
    const metadata: Pick<CleanedArticle, 'pageId' | 'title' | 'url' | 'audit'> = article;
    const summary = summarizeEvaluations([
      { article: metadata, evaluation: { agrees: true, explanation: 'Good.', disagreements: [] } },
      {
        article: { ...metadata, pageId: 43, title: 'Second fixture' },
        evaluation: {
          agrees: false,
          explanation: 'One correction is needed.',
          disagreements: [{
            category: 'noise_retained',
            severity: 'minor',
            location: 'Lead',
            evidence: 'Noise',
            correction: 'Add a narrow selector.',
          }],
        },
      },
    ]);
    expect(summary).toMatchObject({ total: 2, passes: 1, failed: 1, passRatio: 0.5, correctionCount: 1 });
  });

  it('defaults to 100 articles and supports preparation-only title review', () => {
    expect(parseOptions([], {}).count).toBe(100);
    expect(parseOptions(['--count=3'], {}).count).toBe(3);
    expect(parseOptions(['--prepare-only', '--titles=A|B'], {})).toMatchObject({
      count: 2,
      prepareOnly: true,
      titles: ['A', 'B'],
    });
    expect(() => parseOptions(['--count=101'], {})).toThrow('between 1 and 100');
  });
});
