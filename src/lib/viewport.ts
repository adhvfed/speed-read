interface ReadingScrollInput {
  direction: -1 | 0 | 1;
  lineTop: number;
  lineBottom: number;
  viewportHeight: number;
  mobile: boolean;
  topInset: number;
  bottomInset: number;
}

export function readingScrollDelta({
  direction,
  lineTop,
  lineBottom,
  viewportHeight,
  mobile,
  topInset,
  bottomInset,
}: ReadingScrollInput): number {
  const usablePage = Math.max(1, viewportHeight - topInset - bottomInset);
  if (direction > 0) {
    if (mobile) return lineTop >= viewportHeight - bottomInset ? usablePage : 0;
    return lineBottom > viewportHeight - bottomInset ? lineTop - viewportHeight * 0.38 : 0;
  }
  if (direction < 0 && lineTop < topInset) {
    return mobile ? -usablePage : lineTop - viewportHeight * 0.35;
  }
  return 0;
}
