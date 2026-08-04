export function reveal(node: HTMLElement): { destroy: () => void } {
  node.classList.add('reveal');

  if (typeof window === 'undefined') {
    return { destroy: () => {} };
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    node.classList.add('in');
    return { destroy: () => {} };
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          node.classList.add('in');
          io.disconnect();
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
  );

  io.observe(node);

  return {
    destroy: () => io.disconnect(),
  };
}
