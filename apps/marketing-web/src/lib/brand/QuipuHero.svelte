<script lang="ts">
  import { buildRig, type QuipuRig } from './quipu';
  import {
    ENERGY_EPSILON,
    applyImpulse,
    createSim,
    kineticEnergy,
    step,
    type SimState,
  } from './quipu-sim';
  import { drawBackdrop, drawSim } from './quipu-draw';

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
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let sceneEl = $state<HTMLDivElement | null>(null);
  let canvasReady = $state(false);

  /** Caja mutable: el paint del rAF lee el valor actual sin rearmar el efecto. */
  const activeRef = { current: activeCord as string | null };
  $effect(() => {
    activeRef.current = activeCord;
  });

  /* Video: descarga diferida, una sola pasada, se congela en el ultimo frame. */
  $effect(() => {
    const el = videoEl;
    if (!el || !videoSrc) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const onEnded = () => {
      // Congelar el ultimo fotograma: pause + currentTime al final.
      try {
        el.currentTime = Math.max(0, el.duration - 0.04);
      } catch {
        /* ignore seek errors on incomplete metadata */
      }
      el.pause();
    };
    el.addEventListener('ended', onEnded);

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (el.readyState < 2) el.load();
          if (el.ended || el.currentTime >= el.duration - 0.1) return;
          void el.play().catch(() => undefined);
        } else {
          el.pause();
        }
      }
    });

    io.observe(el);
    return () => {
      io.disconnect();
      el.removeEventListener('ended', onEnded);
    };
  });

  /*
   * Canvas: mejora progresiva. El SVG SSR se queda como fallback; al montar,
   * si hay JS y no hay reduced-motion, se dibuja encima y se apaga el SVG.
   */
  $effect(() => {
    const canvas = canvasEl;
    const scene = sceneEl;
    if (!canvas || !scene) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!canvas.getContext) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const hasVideo = Boolean(videoSrc);

    let sim: SimState | null = null;
    let rig: QuipuRig = wide;
    let viewW = 1440;
    let viewH = 900;
    let strokeWidth = 3.2;
    let raf = 0;
    let running = false;
    let wind = 0;
    let lastTs = 0;
    let disposed = false;

    const mq = window.matchMedia('(min-width: 720px)');

    function pickRig() {
      if (mq.matches) {
        rig = wide;
        viewW = 1440;
        viewH = 900;
        strokeWidth = 3.2;
      } else {
        rig = tall;
        viewW = 480;
        viewH = 720;
        strokeWidth = 2.6;
      }
      sim = createSim(rig);
    }

    function resize() {
      const rect = scene!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      pickRig();
      paint();
      canvasReady = true;
      wake();
    }

    function paint() {
      if (!sim) return;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      drawBackdrop(ctx!, {
        width: w,
        height: h,
        viewW,
        viewH,
        glowX: mq.matches ? w * 0.82 : w * 0.5,
        glowY: mq.matches ? h * 0.44 : h * 0.3,
        glowR: h * 0.55,
        rulesFromX: mq.matches ? w * 0.48 : 0,
        transparent: hasVideo,
      });
      drawSim(ctx!, sim, rig, {
        width: w,
        height: h,
        viewW,
        viewH,
        activeCord: activeRef.current,
        strokeWidth,
        transparent: hasVideo,
      });
    }

    function tick(ts: number) {
      if (disposed || !sim) return;
      const dt = Math.min(0.032, (ts - lastTs) / 1000 || 1 / 60);
      lastTs = ts;
      step(sim, dt, { gravity: 0.18, wind, damping: 0.985 });
      // El viento se disipa solo.
      wind *= 0.92;
      paint();
      if (kineticEnergy(sim) > ENERGY_EPSILON || Math.abs(wind) > 0.05) {
        raf = requestAnimationFrame(tick);
      } else {
        running = false;
        raf = 0;
      }
    }

    function wake() {
      if (disposed || running) return;
      running = true;
      lastTs = performance.now();
      raf = requestAnimationFrame(tick);
    }

    function onPointer(e: PointerEvent) {
      if (!sim) return;
      const rect = canvas!.getBoundingClientRect();
      const sx = viewW / rect.width;
      const sy = viewH / rect.height;
      const mx = (e.clientX - rect.left) * sx;
      const my = (e.clientY - rect.top) * sy;

      // Cordel mas cercano al puntero.
      let best: { slug: string; t: number; dist: number } | null = null;
      for (const cord of sim.cords) {
        for (let i = 1; i < cord.nodes.length; i++) {
          const n = cord.nodes[i]!;
          const d = Math.hypot(n.x - mx, n.y - my);
          if (!best || d < best.dist) {
            best = { slug: cord.slug, t: i / (cord.nodes.length - 1), dist: d };
          }
        }
      }
      if (best && best.dist < 80) {
        const cord = sim.cords.find((c) => c.slug === best!.slug)!;
        const idx = Math.round(best.t * (cord.nodes.length - 1));
        const node = cord.nodes[idx]!;
        applyImpulse(sim, best.slug, best.t, mx < node.x ? -16 : 16, 0);
        wake();
      }
    }

    let lastScrollY = window.scrollY;
    function onScroll() {
      const dy = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;
      wind += Math.max(-2.5, Math.min(2.5, dy * 0.04));
      wake();
    }

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) wake();
        else if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
          running = false;
        }
      }
    });
    io.observe(canvas);

    const onMq = () => resize();
    mq.addEventListener('change', onMq);
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    canvas.addEventListener('pointermove', onPointer, { passive: true });

    resize();
    // Empuje inicial sutil: el quipu se asienta al entrar.
    if (sim) {
      applyImpulse(sim, CORDS[0]!.slug, 0.35, 8, 0);
      applyImpulse(sim, CORDS[2]!.slug, 0.5, -6, 0);
      wake();
    }

    return () => {
      disposed = true;
      canvasReady = false;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      mq.removeEventListener('change', onMq);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
      canvas.removeEventListener('pointermove', onPointer);
    };
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

<div
  class="hero-scene"
  class:canvas-on={canvasReady}
  class:has-video={Boolean(videoSrc)}
  bind:this={sceneEl}
  aria-hidden="true"
>
  <!-- SVG: primer pintado sin JS. Se apaga cuando el canvas toma el relevo. -->
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

  <canvas class="q-canvas" bind:this={canvasEl}></canvas>
</div>

{#if videoSrc}
  <video
    class="hero-video has-src"
    bind:this={videoEl}
    src={videoSrc}
    poster={poster ?? undefined}
    preload="none"
    muted
    playsinline
    tabindex="-1"
    aria-hidden="true"
  ></video>
{/if}

<div class="hero-scrim" aria-hidden="true"></div>
