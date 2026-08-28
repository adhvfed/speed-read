import { describe, expect, it } from 'vitest';
import { cleanTitle, isEndMatterHeading, pastedTextToArticle, roundExcerpt, stripReferenceMarkers, usefulParagraphs, wrapParagraphs } from './text';

describe('text preparation', () => {
  it('recognizes combined source appendix headings without matching substantive headings', () => {
    expect(isEndMatterHeading('External links and additional sources')).toBe(true);
    expect(isEndMatterHeading('Additional sources and external links')).toBe(true);
    expect(isEndMatterHeading('Sources of power')).toBe(false);
    expect(isEndMatterHeading('Notes on design')).toBe(false);
  });

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

  it('removes citation markers and the spacing they leave behind', () => {
    expect(stripReferenceMarkers('He joined the club in 2002,[3] aged eight.[12]'))
      .toBe('He joined the club in 2002, aged eight.');
    expect(stripReferenceMarkers('The claim is disputed.[citation needed]'))
      .toBe('The claim is disputed.');
    expect(stripReferenceMarkers('Career[edit]')).toBe('Career');
    expect(stripReferenceMarkers('The line (or von line ) is a boundary.'))
      .toBe('The line (or von line) is a boundary.');
  });

  it('stops at end matter and drops orphaned reference entries', () => {
    expect(
      usefulParagraphs([
        'The opening paragraph carries enough language to establish the subject clearly.',
        'References',
        'Smith, John. A cited work. Publisher, 1998. Retrieved 3 March 2015.',
      ]),
    ).toEqual(['The opening paragraph carries enough language to establish the subject clearly.']);

    expect(
      usefulParagraphs([
        'The opening paragraph carries enough language to establish the subject clearly.',
        '\u2191 One appearance in the Football League Trophy',
        'A second paragraph continues the account with several more words of detail.',
      ]),
    ).toEqual([
      'The opening paragraph carries enough language to establish the subject clearly.',
      'A second paragraph continues the account with several more words of detail.',
    ]);
  });

  it('drops table fragments while keeping headings and short sentences', () => {
    expect(
      usefulParagraphs([
        'Personal life',
        'midfielder',
        'He died in 1994.',
        'Position, club,',
      ]),
    ).toEqual(['Personal life', 'He died in 1994.']);
  });

  it('drops a trailing heading whose section was removed', () => {
    expect(
      usefulParagraphs([
        'The opening paragraph carries enough language to establish the subject clearly.',
        'Career statistics',
      ]),
    ).toEqual(['The opening paragraph carries enough language to establish the subject clearly.']);
  });

  it('removes the site name from a page title', () => {
    expect(cleanTitle('Jordan Wynter - Wikipedia')).toBe('Jordan Wynter');
    expect(cleanTitle('An essay | The Publication', 'The Publication')).toBe('An essay');
    expect(cleanTitle('Wikipedia')).toBe('Wikipedia');
  });

  it('cuts a long article to whole paragraphs within the round budget', () => {
    const paragraphs = ['one two three four five', 'six seven eight nine ten', 'eleven twelve'];
    expect(roundExcerpt(paragraphs, 10)).toEqual(['one two three four five', 'six seven eight nine ten']);
    expect(roundExcerpt(paragraphs, 100)).toEqual(paragraphs);
  });

  it('always keeps at least one paragraph even when it exceeds the budget', () => {
    expect(roundExcerpt(['a paragraph with rather more words than the budget allows'], 3))
      .toEqual(['a paragraph with rather more words than the budget allows']);
  });

  it('wraps into stable lines with semantic word offsets', () => {
    const lines = wrapParagraphs(['one two three four', 'five six'], 13, (text) => text.length);
    expect(lines.map((line) => line.text)).toEqual(['one two three', 'four', 'five six']);
    expect(lines.map((line) => line.startWord)).toEqual([0, 3, 4]);
    expect(lines[2].paragraphStart).toBe(true);
  });
});
