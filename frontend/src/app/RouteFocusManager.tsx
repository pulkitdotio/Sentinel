import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export function RouteFocusManager() {
  const location = useLocation();
  const previousPath = useRef(location.pathname);

  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;

    const heading = document.querySelector<HTMLElement>('main h1');
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
  }, [location.pathname]);

  return null;
}
