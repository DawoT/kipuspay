<script lang="ts">
  interface Props {
    /** Video de fondo. Sin fuente no se emite el elemento. */
    videoSrc?: string | null;
    poster?: string | null;
  }

  let { videoSrc = null, poster = null }: Props = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);

  /* Video: reproduccion garantizada y loop mientras el hero esta en viewport. */
  $effect(() => {
    const el = videoEl;
    if (!el || !videoSrc) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    el.muted = true;
    el.defaultMuted = true;
    void el.play().catch(() => undefined);

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          el.muted = true;
          el.defaultMuted = true;
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
    autoplay
    muted
    loop
    playsinline
    webkit-playsinline
    preload="auto"
    tabindex="-1"
    aria-hidden="true"
  ></video>
{:else if poster}
  <img class="hero-video has-src" src={poster} alt="" aria-hidden="true" />
{/if}

<div class="hero-scrim" aria-hidden="true"></div>
