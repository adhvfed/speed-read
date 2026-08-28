import { describe, expect, it } from 'vitest';
import { linePaceSeconds, windowRange, windowTravelDuration } from './readerMotion';

describe('reader motion', () => {
  it('budgets the full line before movement and clamps extreme durations', () => {
    expect(linePaceSeconds('one two three four five', 300)).toBe(1);
    expect(linePaceSeconds('one', 750)).toBe(0.9);
    expect(linePaceSeconds(Array.from({ length: 100 }, () => 'word').join(' '), 200)).toBe(12);
  });

  it('keeps accessibility on the settled window while prepainting the travel destination', () => {
    expect(windowRange(4, 20, null)).toEqual({
      accessibleStart: 4,
      accessibleEnd: 6,
      visualStart: 4,
      visualEnd: 6,
    });
    expect(windowRange(4, 20, 5)).toEqual({
      accessibleStart: 4,
      accessibleEnd: 6,
      visualStart: 4,
      visualEnd: 7,
    });
    expect(windowRange(4, 20, 3)).toEqual({
      accessibleStart: 4,
      accessibleEnd: 6,
      visualStart: 3,
      visualEnd: 6,
    });
  });

  it('uses constant travel time per line and snaps under reduced motion', () => {
    expect(windowTravelDuration(2, 3, false)).toBe(280);
    expect(windowTravelDuration(2, 4, false)).toBe(560);
    expect(windowTravelDuration(2, 3, true)).toBe(0);
  });
});
