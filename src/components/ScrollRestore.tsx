import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";

const scrollPositions = new Map<string, number>();

/**
 * Continuously tracks scroll position per route and restores it on return.
 * Uses a MutationObserver to detect when content finishes loading/rendering,
 * then restores the saved scroll position.
 */
export function ScrollRestore({ containerRef }: { containerRef: React.RefObject<HTMLElement | null> }) {
  const { pathname } = useLocation();
  const prevPathRef = useRef(pathname);
  const restoredRef = useRef(false);

  // Save scroll position continuously as the user scrolls
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (container && restoredRef.current) {
      scrollPositions.set(pathname, container.scrollTop);
    }
  }, [pathname, containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll, containerRef]);

  // On pathname change, try to restore scroll position
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      restoredRef.current = false;
    }

    const container = containerRef.current;
    if (!container) return;

    const saved = scrollPositions.get(pathname) ?? 0;
    if (saved === 0) {
      container.scrollTop = 0;
      restoredRef.current = true;
      return;
    }

    // Watch for DOM changes (content loading) and try to restore scroll
    // once the container is tall enough to scroll to the saved position
    const tryRestore = () => {
      if (container.scrollHeight >= saved) {
        container.scrollTop = saved;
        restoredRef.current = true;
        return true;
      }
      return false;
    };

    if (tryRestore()) return;

    const observer = new MutationObserver(() => {
      if (tryRestore()) observer.disconnect();
    });

    observer.observe(container, { childList: true, subtree: true });

    // Give up after 2 seconds
    const timeout = setTimeout(() => {
      observer.disconnect();
      restoredRef.current = true;
    }, 2000);

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [pathname, containerRef]);

  return null;
}
