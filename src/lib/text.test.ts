import { describe, expect, it } from 'vitest';
import { pastedTextToArticle, usefulParagraphs, wrapParagraphs } from './text';

describe('text preparation', () => {
  it('keeps article copy while dropping common page furniture', () => {
    expect(
      usefulParagraphs([
        'Subscribe',
        'This is a complete paragraph with enough useful language to survive article extraction.',
        'Privacy policy',
      ]),
    ).toEqual(['This is a complete paragraph with enough useful language to survive article extraction.']);
  });

  it('turns simple HTML paste into titled text', () => {
    const article = pastedTextToArticle(
      '<h1>A useful title</h1><p>The first useful paragraph has enough words to be retained.</p><p>The second useful paragraph remains too.</p>',
    );
    expect(article.title).toBe('A useful title');
    expect(article.paragraphs).toHaveLength(2);
  });

  it('wraps into stable lines with semantic word offsets', () => {
    const lines = wrapParagraphs(['one two three four', 'five six'], 13, (text) => text.length);
    expect(lines.map((line) => line.text)).toEqual(['one two three', 'four', 'five six']);
    expect(lines.map((line) => line.startWord)).toEqual([0, 3, 4]);
    expect(lines[2].paragraphStart).toBe(true);
  });
});
