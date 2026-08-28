import { describe, expect, it } from 'vitest';
import { readingScrollDelta } from './viewport';

describe('reading viewport paging', () => {
  it('does not move the page while a desktop line remains in its safe band', () => {
    expect(readingScrollDelta({ direction: 1, lineTop: 500, readableBottom: 700, viewportHeight: 800, topInset: 24, bottomInset: 72 })).toBe(0);
  });

  it('jumps the active line to the top before the readable window is obscured', () => {
    expect(readingScrollDelta({ direction: 1, lineTop: 610, readableBottom: 729, viewportHeight: 800, topInset: 24, bottomInset: 72 })).toBe(586);
    expect(readingScrollDelta({ direction: -1, lineTop: 10, readableBottom: 130, viewportHeight: 800, topInset: 24, bottomInset: 72 })).toBe(-14);
  });

  it('uses the whole readable window and top inset on mobile', () => {
    const input = { direction: 1 as const, viewportHeight: 700, topInset: 56, bottomInset: 76 };
    expect(readingScrollDelta({ ...input, lineTop: 510, readableBottom: 625 })).toBe(454);
    expect(readingScrollDelta({ ...input, lineTop: 500, readableBottom: 624 })).toBe(0);
  });
});
