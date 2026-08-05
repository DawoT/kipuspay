<script lang="ts">
  import { onMount } from 'svelte';
  import { buildRig, type QuipuRig } from './quipu';
  import { QuipuPhysicsSystem } from './quipu-physics';
  import { drawQuipuCanvas, type DataParticle } from './quipu-renderer';

  interface Props {
    activeCord?: string | null;
    interactive?: boolean;
    compact?: boolean;
    cords?: readonly { readonly slug: string; readonly value: number }[];
  }

  let {
    activeCord = null,
    interactive = true,
    compact = false,
    cords = [
      { slug: 'restaurantes', value: 342 },
      { slug: 'farmacias', value: 213 },
      { slug: 'retail', value: 431 },
      { slug: 'servicios', value: 124 },
      { slug: 'cadenas', value: 232 },
    ],
  }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let animId: number | null = null;
  let isVisible = $state(false);

  const physics = new QuipuPhysicsSystem();
  const rig = $derived<QuipuRig>(
    buildRig(cords, {
      originX: compact ? 60 : 800,
      originY: compact ? 40 : 80,
      spacing: compact ? 70 : 110,
      length: compact ? 320 : 680,
      drift: compact ? 10 : 18,
      compact,
    }),
  );


  let particles = $state<DataParticle[]>([
    { cordIndex: 0, progress: 0.1, speed: 0.006, color: '#eeb765', size: 4 },
    { cordIndex: 2, progress: 0.4, speed: 0.008, color: '#2e9e74', size: 5 },
    { cordIndex: 4, progress: 0.7, speed: 0.005, color: '#f3efe6', size: 3.5 },
  ]);

  function setupPhysics() {
    physics.reset();
    rig.cords.forEach((cord) => {
      let prevNode = physics.addNode(cord.tip.x, rig.primary.y, true);
      const segments = 5;
      const segmentLen = (cord.tip.y - rig.primary.y) / segments;
      for (let i = 1; i <= segments; i++) {
        const currNode = physics.addNode(cord.tip.x, rig.primary.y + i * segmentLen, false);
        physics.addConstraint(prevNode, currNode, segmentLen);
        prevNode = currNode;
      }
    });
  }

  function renderFrame() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const width = canvasEl.clientWidth;
    const height = canvasEl.clientHeight;

    if (canvasEl.width !== width * dpr || canvasEl.height !== height * dpr) {
      canvasEl.width = width * dpr;
      canvasEl.height = height * dpr;
    }

    // Actualizar partículas
    particles.forEach((p) => {
      p.progress += p.speed;
      if (p.progress > 1) p.progress = 0;
    });

    // Actualizar física
    physics.update(0.15, 0.97, 3);

    drawQuipuCanvas(ctx, width, height, physics, rig, particles, dpr, activeCord);
  }

  function loop() {
    if (!isVisible) return;
    renderFrame();
    animId = requestAnimationFrame(loop);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!interactive || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    physics.applyImpulse(x, y, 90, e.movementX * 0.4, e.movementY * 0.4);
  }

  onMount(() => {
    setupPhysics();

    if (!canvasEl) return;

    // Respetar movimiento reducido
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      renderFrame(); // Dibuja frame estatico único
      return;
    }

    // Control de energía por visibilidad
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        isVisible = entry.isIntersecting;
        if (isVisible && !animId) {
          loop();
        } else if (!isVisible && animId) {
          cancelAnimationFrame(animId);
          animId = null;
        }
      }
    });

    observer.observe(canvasEl);

    // Modern Web Guidance: event listener contentvisibilityautostatechange
    const onContentVisibilityStateChange = (e: Event) => {
      const stateEvent = e as CustomEvent<{ skipped?: boolean }>;
      if (stateEvent.detail?.skipped) {
        isVisible = false;
        if (animId) {
          cancelAnimationFrame(animId);
          animId = null;
        }
      } else {
        isVisible = true;
        if (!animId) loop();
      }
    };

    canvasEl.parentElement?.addEventListener(
      'contentvisibilityautostatechange',
      onContentVisibilityStateChange,
    );

    return () => {
      observer.disconnect();
      canvasEl?.parentElement?.removeEventListener(
        'contentvisibilityautostatechange',
        onContentVisibilityStateChange,
      );
      if (animId) cancelAnimationFrame(animId);
    };
  });
</script>

<div class="quipu-canvas-wrapper" class:compact>
  <canvas
    bind:this={canvasEl}
    class="quipu-canvas"
    onpointermove={handlePointerMove}
    aria-hidden="true"
  ></canvas>
</div>

<style>
  .quipu-canvas-wrapper {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    pointer-events: auto;
    content-visibility: auto;
    contain-intrinsic-size: auto none auto 600px;
  }

  .quipu-canvas-wrapper.compact {
    position: relative;
    height: 240px;
    contain-intrinsic-size: auto none auto 240px;
  }

  .quipu-canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
</style>
