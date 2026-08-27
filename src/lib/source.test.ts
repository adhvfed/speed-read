import { describe, expect, it } from 'vitest';
import { inferReadingSource } from './source';

describe('reading source inference', () => {
  it('keeps complete web links', () => {
    expect(inferReadingSource('https://example.com/read?id=1')).toEqual({
      kind: 'url',
      url: 'https://example.com/read?id=1',
    });
  });

  it('adds https to a bare host and path', () => {
    expect(inferReadingSource('en.wikipedia.org/wiki/Reading')).toEqual({
      kind: 'url',
      url: 'https://en.wikipedia.org/wiki/Reading',
    });
  });

  it('treats prose as text even when it contains a dotted word', () => {
    expect(inferReadingSource('Example.com appears in this sentence.')).toEqual({
      kind: 'text',
      text: 'Example.com appears in this sentence.',
    });
  });

  it('rejects unsupported explicit schemes', () => {
    expect(inferReadingSource('ftp://example.com/file')).toEqual({
      kind: 'invalid',
      message: 'Use a public http or https link, or paste the text itself.',
    });
  });
});
