import { useEffect, useRef, useState, type RefObject } from 'react';

export function useElementVisibility<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  isVisible: boolean;
} {
  const ref = useRef<T>(null);
  const [isIntersecting, setIsIntersecting] = useState(true);
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => document.visibilityState !== 'hidden');

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsIntersecting(entry?.isIntersecting ?? false),
      { rootMargin: '120px' },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const updateDocumentVisibility = () => setIsDocumentVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', updateDocumentVisibility);
    return () => document.removeEventListener('visibilitychange', updateDocumentVisibility);
  }, []);

  return { ref, isVisible: isIntersecting && isDocumentVisible };
}
