<script lang="ts">
  import { buildRig, type QuipuRig } from './quipu';

  interface Props {
    /** Cordel del rubro que se ilumina; el resto queda en penumbra. */
    activeCord?: string | null;
    /** Video de fondo (GTM §5.1). Sin fuente no se emite el elemento. */
    videoSrc?: string | null;
    poster?: string | null;
  }

  let { activeCord = null, videoSrc = null, poster = null }: Props = $props();

  /* Cada colgante es un rubro; el numero que cuelga solo ordena el dibujo. */
  const CORDS = [
    { slug: 'restaurantes', value: 342 },
    { slug: 'farmacias', value: 213 },
    { slug: 'retail', value: 431 },
    { slug: 'servicios', value: 124 },
    { slug: 'cadenas', value: 232 },
  ];

  const wide = buildRig(CORDS, {
    originX: 926,
    originY: 78,
    spacing: 112,
    length: 806,
    drift: 17,
    overhang: 460,
  });

  const tall = buildRig(CORDS, {
    originX: 82,
    originY: 62,
    spacing: 82,
    length: 548,
    drift: 12,
    knotScale: 0.86,
    overhang: 220,
  });

  let videoEl = $state<HTMLVideoElement | null>(null);

  /* El video solo se descarga cuando el hero esta a la vista. */
  $effect(() => {
    const el = videoEl;
    if (!el || !videoSrc) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          el.load();
          void el.play().catch(() => undefined);
        } else {
          el.pause();
        }
      }
    });

    io.observe(el);
    return () => io.disconnect();
  });
</script>

{#snippet rig(data: QuipuRig, prefix: string, strokeWidth: number)}
  <mask id={`${prefix}-fade`}>
    <rect width="100%" height="100%" fill={`url(#${prefix}-fadeGrad)`} />
  </mask>

  <g mask={`url(#${prefix}-fade)`}>
    <g class="q-rig">
      <line
        class="q-primary"
        x1={data.primary.x1}
        y1={data.primary.y}
        x2={data.primary.x2}
        y2={data.primary.y}
        stroke-width={strokeWidth * 2.1}
      />

      {#each data.cords as cord, i (cord.slug)}
        <g
          class="q-cord-group"
          class:dim={activeCord !== null && activeCord !== cord.slug}
          data-cord={cord.slug}
          style={`--i:${i}`}
        >
          <path class="q-cord" d={cord.path} pathLength="1" stroke-width={strokeWidth} />
          <line
            class="q-tassel"
            x1={cord.tip.x}
            y1={cord.tip.y}
            x2={cord.tip.x}
            y2={cord.tip.y + strokeWidth * 7}
            stroke-width={strokeWidth * 0.55}
          />
          {#each cord.knots as knot, k (`${cord.slug}-${k}`)}
            <g class="q-knot" style={`--i:${i + k * 0.6}`}>
              <rect
                class="q-knot-halo"
                x={knot.x - knot.size / 2 - 2.5}
                y={knot.y - knot.size / 2 - 2.5}
                width={knot.size + 5}
                height={knot.size + 5}
                transform={`rotate(45 ${knot.x} ${knot.y})`}
              />
              <rect
                class="q-knot-core"
                x={knot.x - knot.size / 2}
                y={knot.y - knot.size / 2}
                width={knot.size}
                height={knot.size}
                transform={`rotate(45 ${knot.x} ${knot.y})`}
              />
              <rect
                class="q-knot-light"
                x={knot.x - knot.size / 2}
                y={knot.y - knot.size / 2}
                width={knot.size}
                height={knot.size * 0.36}
                transform={`rotate(45 ${knot.x} ${knot.y})`}
              />
            </g>
          {/each}
        </g>
      {/each}
    </g>
  </g>
{/snippet}

<div class="hero-scene" aria-hidden="true">
  <svg class="rig rig-wide" viewBox="0 0 1440 900" preserveAspectRatio="xMaxYMin slice">
    <defs>
      <radialGradient id="w-glow" cx="0.5" cy="0.42" r="0.5">
        <stop offset="0%" stop-color="#d99a3d" stop-opacity="0.18" />
        <stop offset="100%" stop-color="#d99a3d" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="w-fadeGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff" stop-opacity="1" />
        <stop offset="62%" stop-color="#fff" stop-opacity="0.72" />
        <stop offset="100%" stop-color="#fff" stop-opacity="0.12" />
      </linearGradient>
    </defs>

    <rect width="1440" height="900" fill="#14161c" />
    <circle cx="1180" cy="400" r="470" fill="url(#w-glow)" />

    <g class="q-rules">
      {#each [140, 240, 340, 440, 540, 640, 740, 840] as y (y)}
        <line x1="690" y1={y} x2="1440" y2={y} />
      {/each}
    </g>

    {@render rig(wide, 'w', 3.2)}
  </svg>

  <svg class="rig rig-tall" viewBox="0 0 480 720" preserveAspectRatio="xMidYMin slice">
    <defs>
      <radialGradient id="t-glow" cx="0.5" cy="0.3" r="0.62">
        <stop offset="0%" stop-color="#d99a3d" stop-opacity="0.2" />
        <stop offset="100%" stop-color="#d99a3d" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="t-fadeGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff" stop-opacity="1" />
        <stop offset="58%" stop-color="#fff" stop-opacity="0.6" />
        <stop offset="100%" stop-color="#fff" stop-opacity="0.05" />
      </linearGradient>
    </defs>

    <rect width="480" height="720" fill="#14161c" />
    <circle cx="240" cy="210" r="300" fill="url(#t-glow)" />

    <g class="q-rules">
      {#each [120, 220, 320, 420, 520, 620] as y (y)}
        <line x1="0" y1={y} x2="480" y2={y} />
      {/each}
    </g>

    {@render rig(tall, 't', 2.6)}
  </svg>
</div>

{#if videoSrc}
  <video
    class="hero-video"
    bind:this={videoEl}
    src={videoSrc}
    poster={poster ?? undefined}
    preload="none"
    muted
    playsinline
    loop
    tabindex="-1"
    aria-hidden="true"
  ></video>
{/if}

<div class="hero-scrim" aria-hidden="true"></div>
