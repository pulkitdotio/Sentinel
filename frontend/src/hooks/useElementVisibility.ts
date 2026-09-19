import { useEffect, useRef, useState, type RefObject } from 'react';

export function useElementVisibility<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  isVisible: boolean;
} {
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry?.isIntersecting ?? false),
      { rootMargin: '120px' },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}
