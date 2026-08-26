import { describe, expect, it } from 'vitest';
import type { StoredArticle } from '../types';
import { articleIdFor, planArticlePruning } from './articleStore';

function stored(id: string, bytes: number, lastAccessedAt: number): StoredArticle {
  return {
    id,
    article: { title: id, byline: null, siteName: null, sourceUrl: null, paragraphs: ['Useful text.'] },
    sourceType: 'text',
    createdAt: lastAccessedAt,
    updatedAt: lastAccessedAt,
    lastAccessedAt,
    estimatedBytes: bytes,
  };
}

describe('bounded article storage', () => {
  it('prunes least-recently-used articles until the byte budget fits', () => {
    const plan = planArticlePruning(
      [stored('old', 400, 1), stored('newer', 400, 2), stored('newest', 400, 3)],
      { id: 'incoming', estimatedBytes: 500 },
      1_300,
    );
    expect(plan).toEqual({ accepted: true, deleteIds: ['old'] });
  });

  it('rejects one article larger than the entire application budget without deleting anything', () => {
    expect(planArticlePruning([stored('kept', 100, 1)], { id: 'huge', estimatedBytes: 2_000 }, 1_000))
      .toEqual({ accepted: false, deleteIds: [] });
  });

  it('uses a stable source-derived identifier', async () => {
    const article = { title: 'One', byline: null, siteName: null, sourceUrl: 'https://example.com/a', paragraphs: ['Text.'] };
    await expect(articleIdFor(article, 'url')).resolves.toBe(await articleIdFor({ ...article, title: 'Updated' }, 'url'));
  });
});
