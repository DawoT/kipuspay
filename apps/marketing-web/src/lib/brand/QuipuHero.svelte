<script lang="ts">
  interface Props {
    /** Video de fondo (GTM §5.1). Sin fuente no se emite el elemento. */
    videoSrc?: string | null;
    poster?: string | null;
  }

  let { videoSrc = null, poster = null }: Props = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);

  /* Video: descarga diferida, loop mientras el hero esta en viewport. */
  $effect(() => {
    const el = videoEl;
    if (!el || !videoSrc) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (el.readyState < 2) el.load();
          void el.play().catch(() => undefined);
        } else {
          el.pause();
        }
      }
    });

    io.observe(el);
    return () => {
      io.disconnect();
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
    loop
    playsinline
    tabindex="-1"
    aria-hidden="true"
  ></video>
{:else if poster}
  <img class="hero-video has-src" src={poster} alt="" aria-hidden="true" />
{/if}

<div class="hero-scrim" aria-hidden="true"></div>
