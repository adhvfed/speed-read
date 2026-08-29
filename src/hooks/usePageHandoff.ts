import { useCallback, useEffect, useRef, useState } from 'react';

const PAGE_HANDOFF_MS = 360;
const ANCHOR_LINGER_MS = 900;

export interface HandoffAnchor {
  text: string;
  left: number;
  top: number;
  width: number;
}

interface StartPageHandoffInput {
  anchor: HTMLElement | null;
  fallbackDelta: number;
  topInset: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function usePageHandoff() {
  const [turning, setTurning] = useState(false);
  const [anchor, setAnchor] = useState<HandoffAnchor | null>(null);
  const frame = useRef(0);
  const anchorTimeout = useRef(0);

  const start = useCallback(({ anchor: anchorElement, fallbackDelta, topInset }: StartPageHandoffInput) => {
    if (turning) return;
    const bounds = anchorElement?.getBoundingClientRect();
    const scrollDelta = bounds ? bounds.top - topInset : fallbackDelta;
    const scrollStart = window.scrollY;
    const started = performance.now();

    window.clearTimeout(anchorTimeout.current);
    setAnchor(anchorElement && bounds ? {
      text: anchorElement.textContent ?? '',
      left: bounds.left,
      top: Math.max(10, topInset - 42),
      width: bounds.width,
    } : null);
    setTurning(true);

    const turnPage = (now: number) => {
      const elapsed = Math.min(1, (now - started) / PAGE_HANDOFF_MS);
      // Reposition only while the cabinet shutter covers the paper.
      const travel = clamp((elapsed - 0.25) / 0.5, 0, 1);
      const eased = travel < 0.5
        ? 2 * travel * travel
        : 1 - ((-2 * travel + 2) ** 2) / 2;
      window.scrollTo({ top: scrollStart + scrollDelta * eased, left: 0, behavior: 'auto' });
      if (elapsed < 1) {
        frame.current = requestAnimationFrame(turnPage);
        return;
      }
      frame.current = 0;
      setTurning(false);
      anchorTimeout.current = window.setTimeout(() => setAnchor(null), ANCHOR_LINGER_MS);
    };
    frame.current = requestAnimationFrame(turnPage);
  }, [turning]);

  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    window.clearTimeout(anchorTimeout.current);
  }, []);

  return { anchor, start, turning };
}
