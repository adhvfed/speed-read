import { describe, expect, it } from 'vitest';
import { readingScrollDelta } from './viewport';

describe('reading viewport paging', () => {
  it('does not move the page while a desktop line remains in its safe band', () => {
    expect(readingScrollDelta({ direction: 1, lineTop: 500, lineBottom: 540, viewportHeight: 800, mobile: false, topInset: 24, bottomInset: 72 })).toBe(0);
  });

  it('moves a desktop line back toward the reading band only after it crosses the edge', () => {
    expect(readingScrollDelta({ direction: 1, lineTop: 720, lineBottom: 756, viewportHeight: 800, mobile: false, topInset: 24, bottomInset: 72 })).toBe(416);
    expect(readingScrollDelta({ direction: -1, lineTop: 10, lineBottom: 46, viewportHeight: 800, mobile: false, topInset: 24, bottomInset: 72 })).toBe(-270);
  });

  it('pages mobile by one usable screen only when the curtain reaches the dock', () => {
    const input = { direction: 1 as const, lineBottom: 710, viewportHeight: 700, mobile: true, topInset: 56, bottomInset: 76 };
    expect(readingScrollDelta({ ...input, lineTop: 630 })).toBe(568);
    expect(readingScrollDelta({ ...input, lineTop: 620 })).toBe(0);
  });
});
