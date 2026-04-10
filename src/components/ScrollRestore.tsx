import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const scrollPositions = new Map<string, number>();

export function ScrollRestore({ containerRef }: { containerRef: React.RefObject<HTMLElement | null> }) {
  const { pathname } = useLocation();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Continuously save scroll position under the current pathname
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      scrollPositions.set(pathnameRef.current, container.scrollTop);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [containerRef]);

  // Restore scroll position when pathname changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const saved = scrollPositions.get(pathname) ?? 0;

    // Wait for content to render before restoring
    const raf = requestAnimationFrame(() => {
      container.scrollTop = saved;
    });

    return () => cancelAnimationFrame(raf);
  }, [pathname, containerRef]);

  return null;
}
