/** Helpers shared by the plant views. */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

export const svgClass = 'h-full max-h-56 w-full';

export const label = 'fill-text-muted text-[11px] font-medium';

export function Status({ items }: { items: string[] }) {
  return (
    <p className="sr-only" aria-live="polite">
      {items.join('. ')}
    </p>
  );
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** On the server we assume reduced motion so the first render matches. */
export const usePrefersReducedMotion = () =>
  useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );

/** Rotor angle that turns proportionally to `speed` (−1…1), frame by frame. */
export function useRotorAngle(speed: number, enabled: boolean): number {
  const [angle, setAngle] = useState(0);
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      // Negative speed turns the other way (reversing motor).
      if (speedRef.current !== 0)
        setAngle((a) => (((a + speedRef.current * 540 * dt) % 360) + 360) % 360);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled]);
  return angle;
}
