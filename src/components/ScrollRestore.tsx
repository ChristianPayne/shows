import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const scrollPositions = new Map<string, number>();

/**
 * Saves scroll position when leaving a route and restores it when returning.
 * Must be rendered inside the scrollable container.
 */
export function ScrollRestore({ containerRef }: { containerRef: React.RefObject<HTMLElement | null> }) {
  const { pathname } = useLocation();
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Save scroll position of the route we're leaving
    if (prevPathRef.current !== pathname) {
      scrollPositions.set(prevPathRef.current, container.scrollTop);
      prevPathRef.current = pathname;
    }

    // Restore scroll position for the route we're entering
    const saved = scrollPositions.get(pathname);
    container.scrollTop = saved ?? 0;
  }, [pathname, containerRef]);

  return null;
}
