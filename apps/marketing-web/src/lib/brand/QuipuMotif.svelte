<script lang="ts">
  import { buildRig, digitsOf } from './quipu';
  import { clampCordCount, cordColor, cordValue, motifIds, type MotifKind } from './quipu-motif';

  export type { MotifKind };

  interface Props {
    kind: MotifKind;
    /** Numero de cordeles (loom) o ramas (network). */
    count?: number;
    /** Resalta un cordel por slug (vertical). */
    active?: string | null;
    /** Prefijo estable para ids SVG (SSR-safe). */
    id?: string;
    class?: string;
  }

  let {
    kind,
    count = 5,
    active = null,
    id = kind,
    class: className = '',
  }: Props = $props();

  const ids = $derived(motifIds(id));
  const n = $derived(clampCordCount(count));
  const cords = $derived(Array.from({ length: n }, (_, i) => i));
  const slugs = $derived(
    ['restaurantes', 'farmacias', 'retail', 'servicios', 'cadenas'].slice(0, n),
  );

  const loom = $derived(
    buildRig(
      slugs.map((slug) => ({ slug, value: cordValue(slug) })),
      { originX: 32, originY: 12, spacing: 64, length: 52, drift: 6, knotScale: 0.33, compact: true },
    ),
  );

  const stitches = $derived(
    Array.from({ length: 5 }, (_, i) => {
      const t = 0.08 + (i / 4) * 0.84;
      return {
        x1: 116 + t * 48,
        y1: 24 + (i % 2 === 0 ? 2.5 : -2.5),
        x2: 116 + t * 48 + 5.2,
        y2: 24 + (i % 2 === 0 ? 10 : -10),
      };
    }),
  );
</script>

{#snippet knotGlyph(x: number, y: number, size: number, tier: string)}
  {@const s = Math.max(2.2, size)}
  <g class={`qm-knot qm-knot-${tier}`} transform={`translate(${Math.round(x)} ${Math.round(y)})`}>
    <rect class="qm-knot-halo" x={-s / 2 - 1.4} y={-s / 2 - 1.4} width={s + 2.8} height={s + 2.8} transform="rotate(45)" />
    <rect class="qm-knot-core" x={-s / 2} y={-s / 2} width={s} height={s} transform="rotate(45)" />
  </g>
{/snippet}

{#if kind === 'loom'}
  <svg
    class={`quipu-motif motif-loom ${className}`}
    viewBox="0 0 320 72"
    preserveAspectRatio="none"
    aria-hidden="true"
    focusable="false"
  >
    <line class="qm-primary qm-primary-soft" x1="6" y1="12" x2="314" y2="12" />
    <line class="qm-primary" x1="6" y1="12" x2="314" y2="12" />
    {#each loom.cords as cord, i (cord.slug)}
      {@const isActive = cord.slug === active}
      <g class="qm-hang" class:active={isActive} style={`--i:${i}; --cord:${cordColor(cord.slug)}`}>
        <path class="qm-cord-soft" d={cord.path} pathLength="1" />
        <path class="qm-cord" d={cord.path} pathLength="1" />
        {#each cord.knots as knot (knot.y)}
          {@render knotGlyph(knot.x, knot.y, knot.size, knot.tier)}
        {/each}
        <path
          class="qm-tassel"
          d={`M${cord.tip.x} ${cord.tip.y} l-2.4 4 M${cord.tip.x} ${cord.tip.y} l0 4.6 M${cord.tip.x} ${cord.tip.y} l2.4 4`}
        />
      </g>
    {/each}
  </svg>
{:else if kind === 'tension'}
  <svg
    class={`quipu-motif motif-tension ${className}`}
    viewBox="0 0 120 16"
    preserveAspectRatio="none"
    aria-hidden="true"
    focusable="false"
  >
    <path
      class="qm-cord qm-tangled"
      d="M2 7 C18 2, 28 12, 42 7 S68 1, 82 8 S104 13, 118 7"
      pathLength="1"
    />
    {#each [28.5, 58.5, 90.5] as cx (cx)}
      <g class="qm-knot qm-knot-tangled" transform={`translate(${cx} 8)`}>
        <rect x="-2.5" y="-2.5" width="5" height="5" transform="rotate(45)" />
      </g>
    {/each}
    <path class="qm-cord qm-straight" d="M2 8 L118 8" pathLength="1" />
    {#each [32, 60, 88] as cx (cx)}
      <g transform={`translate(${cx} 8)`}>
        <rect class="qm-knot-halo qm-knot-tidy-halo" x="-3.8" y="-3.8" width="7.6" height="7.6" transform="rotate(45)" />
        <rect class="qm-knot qm-knot-tidy" x="-2.4" y="-2.4" width="4.8" height="4.8" transform="rotate(45)" />
      </g>
    {/each}
  </svg>
{:else if kind === 'reconnect'}
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
        <stop offset="42%" stop-color="currentColor" stop-opacity="0.15" />
        <stop offset="58%" stop-color="currentColor" stop-opacity="0.15" />
        <stop offset="100%" stop-color="currentColor" stop-opacity="1" />
      </linearGradient>
    </defs>
    <path
      class="qm-cord qm-broken"
      d="M8 24 H112 M168 24 H272"
      stroke={`url(#${ids.gap})`}
      pathLength="1"
    />
    <path class="qm-cord qm-fray qm-fray-l" d="M112 24 l-4 -4 M112 24 l-4 4" />
    <path class="qm-cord qm-fray qm-fray-r" d="M168 24 l4 -4 M168 24 l4 4" />
    {#each stitches as st, i (i)}
      <path
        class="qm-cord qm-stitch"
        d={`M${Math.round(st.x1)} ${Math.round(st.y1)} L${Math.round(st.x2)} ${Math.round(st.y2)}`}
        style={`--i:${i}`}
        pathLength="1"
      />
    {/each}
    <path class="qm-cord qm-thread" d="M116 24 H164" pathLength="1" />
    <g class="qm-knot qm-left" transform="translate(115.5 24)">
      <rect x="-3.5" y="-3.5" width="7" height="7" transform="rotate(45)" />
    </g>
    <g class="qm-knot qm-right" transform="translate(164.5 24)">
      <rect x="-3.5" y="-3.5" width="7" height="7" transform="rotate(45)" />
    </g>
    <g class="qm-knot qm-join" transform="translate(140 24)">
      <rect x="-3.5" y="-3.5" width="7" height="7" transform="rotate(45)" />
    </g>
  </svg>
{:else if kind === 'network'}
  <svg
    class={`quipu-motif motif-network ${className}`}
    viewBox="0 0 200 120"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
    focusable="false"
  >
    <line class="qm-primary qm-primary-soft" x1="24" y1="18" x2="176" y2="18" />
    <line class="qm-primary" x1="24" y1="18" x2="176" y2="18" />
    {#each cords as i (i)}
      {@const branchSlug = slugs[i] ?? 'servicios'}
      {@const branchValue = cordValue(branchSlug) % 100}
      {@const branchColor = cordColor(branchSlug)}
      {@const tipY = 76 + (i % 2) * 16}
      {@const [_, tens, units] = digitsOf(branchValue)}
      {@const bx = 40 + i * 48}
      {@const ctrl = bx + (i - 1) * 5}
      <g class="qm-branch" class:active={active === branchSlug} style={`--i:${i}; --cord:${branchColor}`}>
        <path class="qm-cord-soft" d={`M${bx} 18 C${bx} 40, ${ctrl} 54, ${bx} ${tipY}`} pathLength="1" />
        <path class="qm-cord" d={`M${bx} 18 C${bx} 40, ${ctrl} 54, ${bx} ${tipY}`} pathLength="1" />
        {#if tens > 0}
          <g class="qm-knot qm-knot-tens" transform={`translate(${bx + 6} ${tipY - 9})`}>
            <rect x="-2" y="-2" width="4" height="4" transform="rotate(45)" />
          </g>
        {/if}
        {#if units > 0}
          <g class="qm-knot qm-knot-units" transform={`translate(${bx - 6} ${tipY + 3})`}>
            <rect x="-1.6" y="-1.6" width="3.2" height="3.2" transform="rotate(45)" />
          </g>
        {/if}
        <g class="qm-knot qm-knot-tip" transform={`translate(${bx} ${tipY})`}>
          <rect x="-3" y="-3" width="6" height="6" transform="rotate(45)" />
        </g>
        <path
          class="qm-tassel"
          d={`M${bx} ${tipY + 5} l-2 3 M${bx} ${tipY + 5} l0 3.6 M${bx} ${tipY + 5} l2 3`}
        />
      </g>
    {/each}
  </svg>
{:else}
  <svg
    class={`quipu-motif motif-seal ${className}`}
    viewBox="0 0 200 80"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
    focusable="false"
  >
    <circle class="qm-ring" cx="100" cy="44" r="30" />
    <circle class="qm-ring qm-ring-soft" cx="100" cy="44" r="22" />
    {#each [0, 1, 2, 3, 4, 5, 6, 7] as tick (tick)}
      {@const a = (tick * Math.PI) / 4}
      <line
        class="qm-tick"
        x1={100 + Math.cos(a) * 30}
        y1={44 + Math.sin(a) * 30}
        x2={100 + Math.cos(a) * 34}
        y2={44 + Math.sin(a) * 34}
      />
    {/each}
    {#each [0, 1, 2, 3, 4] as i (i)}
      {@const x0 = 30 + i * 35}
      <path
        class="qm-cord"
        d={`M${x0} 8 C${x0 + (i - 2) * 6} 26, 96 ${(i - 2) * 4 + 34}, 100 40`}
        pathLength="1"
        style={`--i:${i}`}
      />
    {/each}
    <g class="qm-seal-stack" transform="translate(100 42)">
      <rect class="qm-knot qm-seal-halo" x="-14" y="-14" width="28" height="28" transform="rotate(45)" />
      <rect class="qm-knot qm-seal-core" x="-8" y="-8" width="16" height="16" transform="rotate(45)" />
      <rect class="qm-knot qm-seal-center" x="-3.4" y="-3.4" width="6.8" height="6.8" transform="rotate(45)" />
    </g>
  </svg>
{/if}
