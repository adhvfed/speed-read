import { describe, expect, it } from 'vitest';
import {
  buildModelRequest,
  MODES,
  parseOptions,
  parseWikipediaSections,
  validateModelResult,
} from './research-wikipedia-cleaning.mjs';

const fixture = `
  <div class="mw-parser-output"></div>
  <div id="mw-content-text"><div class="mw-parser-output">
    <table><tr><th>Born</th><td>1901</td></tr></table>
    <p>The lead explains the subject in useful continuous prose.<sup class="reference">[1]</sup></p>
    <div class="mw-heading mw-heading2"><h2>History</h2><span class="mw-editsection">[edit]</span></div>
    <p>The history section develops the subject with another readable paragraph.</p>
    <ul><li>First event</li><li>Second event</li></ul>
    <div class="mw-heading mw-heading2"><h2>References</h2><span class="mw-editsection">[edit]</span></div>
    <ol class="references"><li>Example source</li><li>Another source</li></ol>
  </div></div>`;

describe('Wikipedia cleaning research script', () => {
  it('extracts lead and top-level sections with format and noise evidence', () => {
    const sections = parseWikipediaSections(fixture);
    expect(sections.map((section) => section.heading)).toEqual(['Lead', 'History', 'References']);
    expect(sections[0].text).toContain('[table] Born | 1901');
    expect(sections[0].elementStats.references).toBe(1);
    expect(sections[1].elementStats.listItems).toBe(2);
    expect(sections[1].headingRaw).toContain('[edit]');
    expect(sections[2].text).toContain('- Example source');
  });

  it('builds bounded, stateless, tool-free Luna structured-output requests for both cohorts', () => {
    const sections = parseWikipediaSections(fixture);
    sections[0] = { ...sections[0], truncated: true, characterCount: 9_000 };
    const article = { title: 'Fixture', url: 'https://en.wikipedia.org/wiki/Fixture', sections };
    for (const mode of Object.values(MODES)) {
      const request = buildModelRequest(mode, article);
      expect(request.model).toBe('gpt-5.6-luna');
      expect(request.store).toBe(false);
      expect(request).not.toHaveProperty('tools');
      expect(request.text.format.strict).toBe(true);
      expect(request.text.format.schema.properties.decisions.minItems).toBe(3);
      expect(JSON.parse(request.input).article.sections[0].truncated).toBe(true);
    }
    const reformulateDecisions = buildModelRequest(MODES.REFORMULATE, article).text.format.schema.properties.decisions;
    expect(reformulateDecisions.items.properties.decision.enum).toContain('reformulate');
    expect(reformulateDecisions.items.properties).toHaveProperty('reformulatedText');
  });

  it('rejects missing, reordered, or mode-invalid decisions', () => {
    const article = { title: 'Fixture', url: 'https://en.wikipedia.org/wiki/Fixture', sections: parseWikipediaSections(fixture) };
    const valid = {
      articleSummary: 'Fixture summary',
      decisions: article.sections.map((section) => ({
        sectionId: section.sectionId,
        heading: section.heading,
        decision: 'keep',
        rationale: 'Useful prose.',
        noiseSignals: [],
      })),
    };
    expect(validateModelResult(MODES.BINARY, article, valid)).toBe(valid);
    expect(() => validateModelResult(MODES.BINARY, article, { ...valid, decisions: [...valid.decisions].reverse() })).toThrow('every sectionId in order');
    expect(() => validateModelResult(MODES.BINARY, article, {
      ...valid,
      decisions: valid.decisions.map((decision, index) => index === 0 ? { ...decision, decision: 'reformulate' } : decision),
    })).toThrow('invalid section decision');
  });

  it('defaults to two cohorts of twenty and accepts a small smoke sample', () => {
    expect(parseOptions([], {}).perMode).toBe(20);
    expect(parseOptions(['--per-mode=1'], {}).perMode).toBe(1);
    expect(() => parseOptions(['--per-mode=21'], {})).toThrow('between 1 and 20');
  });
});
