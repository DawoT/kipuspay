<script lang="ts">
  import { onMount } from 'svelte';
  import { buildRig, type QuipuRig } from './quipu';
  import { QuipuPhysicsSystem } from './quipu-physics';
  import { drawQuipuCanvas, type DataParticle } from './quipu-renderer';

  export type MotifKind = 'loom' | 'tension' | 'reconnect' | 'network' | 'seal';

  interface Props {
    kind: MotifKind;
    id: string;
    active?: string | null;
    count?: number;
  }

  let { kind, id, active = null, count = 5 }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let animId: number | null = null;
  let isVisible = $state(false);

  const physics = new QuipuPhysicsSystem();

  const mockCords = $derived(
    Array.from({ length: Math.min(Math.max(count, 1), 6) }, (_, i) => ({
      slug: `cord-${i}`,
      value: (i + 1) * 111,
    })),
  );

  const rig = $derived<QuipuRig>(
    buildRig(mockCords, {
      originX: 40,
      originY: 20,
      spacing: 45,
      length: 120,
      drift: 6,
      compact: true,
    }),
  );

  const particles = $derived<DataParticle[]>([
    { cordIndex: 0, progress: 0.2, speed: 0.01, color: '#eeb765', size: 3 },
    { cordIndex: Math.min(2, Math.max(count - 1, 0)), progress: 0.6, speed: 0.012, color: '#2e9e74', size: 3.5 },
  ]);


  function renderFrame() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const width = canvasEl.clientWidth || 240;
    const height = canvasEl.clientHeight || 140;

    if (canvasEl.width !== width * dpr || canvasEl.height !== height * dpr) {
      canvasEl.width = width * dpr;
      canvasEl.height = height * dpr;
    }

    particles.forEach((p) => {
      p.progress += p.speed;
      if (p.progress > 1) p.progress = 0;
    });

    physics.update(0.1, 0.97, 2);

    drawQuipuCanvas(ctx, width, height, physics, rig, particles, dpr, active);
  }

  function loop() {
    if (!isVisible) return;
    renderFrame();
    animId = requestAnimationFrame(loop);
  }

  onMount(() => {
    if (!canvasEl) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      renderFrame();
      return;
    }

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
    return () => {
      observer.disconnect();
      if (animId) cancelAnimationFrame(animId);
    };
  });
</script>

<div class="quipu-motif-wrapper" data-kind={kind} id={`motif-${id}`}>
  <canvas bind:this={canvasEl} class="quipu-motif-canvas" aria-hidden="true"></canvas>
</div>

<style>
  .quipu-motif-wrapper {
    position: relative;
    width: 100%;
    height: 140px;
    overflow: hidden;
    content-visibility: auto;
    contain-intrinsic-size: auto none auto 140px;
  }

  .quipu-motif-canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
