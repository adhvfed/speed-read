export const READING_WINDOW_LINES = 3;
export const WINDOW_TRAVEL_MS = 280;

export interface ReaderWindowRange {
  accessibleStart: number;
  accessibleEnd: number;
  visualStart: number;
  visualEnd: number;
}

export function linePaceSeconds(text: string, wordsPerMinute: number): number {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  if (!Number.isFinite(wordsPerMinute) || wordsPerMinute <= 0) return 2;
  return Math.min(12, Math.max(0.9, (words / wordsPerMinute) * 60));
}

export function windowRange(activeIndex: number, lineCount: number, travelTarget: number | null): ReaderWindowRange {
  const lastIndex = Math.max(0, lineCount - 1);
  const accessibleStart = Math.min(lastIndex, Math.max(0, activeIndex));
  const accessibleEnd = Math.min(lastIndex, accessibleStart + READING_WINDOW_LINES - 1);
  if (travelTarget === null) {
    return { accessibleStart, accessibleEnd, visualStart: accessibleStart, visualEnd: accessibleEnd };
  }

  const targetStart = Math.min(lastIndex, Math.max(0, travelTarget));
  const targetEnd = Math.min(lastIndex, targetStart + READING_WINDOW_LINES - 1);
  return {
    accessibleStart,
    accessibleEnd,
    visualStart: Math.min(accessibleStart, targetStart),
    visualEnd: Math.max(accessibleEnd, targetEnd),
  };
}

export function windowTravelDuration(fromIndex: number, toIndex: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return Math.max(1, Math.abs(toIndex - fromIndex)) * WINDOW_TRAVEL_MS;
}
