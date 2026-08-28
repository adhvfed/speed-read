import { describe, expect, it } from 'vitest';
import { parseHashRoute, roundHash, scoreHash } from './routes';

describe('hash routes', () => {
  it('reads the progress screen', () => {
    expect(parseHashRoute('#progress')).toEqual({ view: 'progress' });
  });

  it('reads a saved article back to its bet screen', () => {
    expect(parseHashRoute('#round/ABCDEF0123456789')).toEqual({
      view: 'round',
      articleId: 'abcdef0123456789',
    });
  });

  it('reads a scored round', () => {
    const id = 'b3f1c2d4-aaaa-bbbb-cccc-dddddddddddd';
    expect(parseHashRoute(scoreHash(id))).toEqual({ view: 'score', roundId: id });
  });

  it('falls back home for anything unrecognised', () => {
    expect(parseHashRoute('#read/abcdef0123456789/12')).toEqual({ view: 'home' });
    expect(parseHashRoute('#nonsense')).toEqual({ view: 'home' });
    expect(parseHashRoute('')).toEqual({ view: 'home' });
  });

  it('builds the hashes it parses', () => {
    expect(roundHash('abcdef0123456789')).toBe('#round/abcdef0123456789');
  });
});
