interface ReadingScrollInput {
  direction: -1 | 0 | 1;
  lineTop: number;
  readableBottom: number;
  viewportHeight: number;
  topInset: number;
  bottomInset: number;
}

export function readingScrollDelta({
  direction,
  lineTop,
  readableBottom,
  viewportHeight,
  topInset,
  bottomInset,
}: ReadingScrollInput): number {
  if (direction > 0) {
    return readableBottom > viewportHeight - bottomInset ? lineTop - topInset : 0;
  }
  if (direction < 0 && lineTop < topInset) {
    return lineTop - topInset;
  }
  return 0;
}
