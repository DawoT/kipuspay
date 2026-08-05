<script lang="ts">
  import { motifIds } from './quipu-motif';

  interface Props {
    /** Prefijo estable para ids SVG (SSR-safe). */
    id?: string;
    class?: string;
  }

  let { id = 'reconnect', class: className = '' }: Props = $props();

  const ids = $derived(motifIds(id));
</script>

<!-- Unico motivo mid-page: ruptura → costura. Sin arcoiris ni halos. -->
<svg
  class={`quipu-motif motif-reconnect ${className}`}
  viewBox="0 0 280 48"
  preserveAspectRatio="xMidYMid meet"
  aria-hidden="true"
  focusable="false"
>
  <defs>
    <linearGradient id={ids.gap} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="currentColor" stop-opacity="1" />
      <stop offset="42%" stop-color="currentColor" stop-opacity="0.12" />
      <stop offset="58%" stop-color="currentColor" stop-opacity="0.12" />
      <stop offset="100%" stop-color="currentColor" stop-opacity="1" />
    </linearGradient>
  </defs>
  <path
    class="qm-cord qm-broken"
    d="M8 24 H112 M168 24 H272"
    stroke={`url(#${ids.gap})`}
    pathLength="1"
  />
  <path class="qm-cord qm-stitched" d="M8 24 H272" pathLength="1" />
  <rect
    class="qm-knot qm-join"
    x="136.5"
    y="20.5"
    width="7"
    height="7"
    transform="rotate(45 140 24)"
  />
</svg>
