<script lang="ts">
  import {
    markKnotY,
    markKnotYFromProgress,
    sectionScrollProgress,
    type SectionMarkState,
  } from './quipu-motif';

  interface Props {
    state?: SectionMarkState;
    /** paper = seccion clara; ink = seccion oscura */
    tone?: 'paper' | 'ink';
    class?: string;
  }

  /* `state` se renombra: un identificador llamado `state` convierte `$state` en store_get. */
  let { state: markState = 'entry', tone = 'paper', class: className = '' }: Props = $props();

  let svgEl = $state<SVGSVGElement | null>(null);
  let scrollY: number | null = $state(null);

  const knotY = $derived(scrollY ?? markKnotY(markState));

  $effect(() => {
    const svg = svgEl;
    if (!svg || typeof window === 'undefined') return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const section = svg.closest('.section');
    if (!(section instanceof HTMLElement)) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = section.getBoundingClientRect();
      scrollY = markKnotYFromProgress(sectionScrollProgress(rect, window.innerHeight));
    };

    const onScrollOrResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  });
</script>

<svg
  bind:this={svgEl}
  class={`section-mark tone-${tone} ${className}`}
  viewBox="0 0 24 120"
  width="24"
  height="120"
  preserveAspectRatio="xMidYMin meet"
  aria-hidden="true"
  focusable="false"
>
  <line class="sm-fiber" x1="12" y1="4" x2="12" y2="116" />
  <rect
    class="sm-knot"
    x="8.5"
    y={knotY - 3.5}
    width="7"
    height="7"
    transform={`rotate(45 12 ${knotY})`}
  />
</svg>
