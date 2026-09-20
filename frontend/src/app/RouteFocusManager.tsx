import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export function RouteFocusManager() {
  const location = useLocation();
  const previousPath = useRef(location.pathname);

  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;

    const focusHeading = (): boolean => {
      const heading = document.querySelector<HTMLElement>('main h1');
      if (!heading) return false;
      heading.tabIndex = -1;
      heading.focus();
      return true;
    };

    if (focusHeading()) return;

    const observer = new window.MutationObserver(() => {
      if (focusHeading()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => observer.disconnect(), 10_000);

    return () => {
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, [location.pathname]);

  return null;
}
