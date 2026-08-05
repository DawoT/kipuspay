<script lang="ts">
  interface Props {
    /** Video de fondo (GTM §5.1). Sin fuente no se emite el elemento. */
    videoSrc?: string | null;
    poster?: string | null;
  }

  let { videoSrc = null, poster = null }: Props = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);

  /* Video: descarga diferida, una sola pasada, se congela en el ultimo frame. */
  $effect(() => {
    const el = videoEl;
    if (!el || !videoSrc) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const onEnded = () => {
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
</script>

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
{:else if poster}
  <img class="hero-video has-src" src={poster} alt="" aria-hidden="true" />
{/if}

<div class="hero-scrim" aria-hidden="true"></div>
