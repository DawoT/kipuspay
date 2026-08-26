<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    theme?: 'light' | 'dark';
    time?: string;
    title?: string;
    statusBadge?: string;
    statusTone?: 'live' | 'sync' | 'offline';
    ariaLabel?: string;
    children?: Snippet;
  }

  let {
    theme = 'dark',
    time: explicitTime,
    title = 'KipusPay',
    statusBadge = 'EN VIVO',
    statusTone = 'live',
    ariaLabel = 'Smartphone mostrando interfaz interactiva de KipusPay',
    children,
  }: Props = $props();

  function formatRealTime(): string {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  let liveTime = $state<string>(explicitTime ?? formatRealTime());

  onMount(() => {
    liveTime = explicitTime ?? formatRealTime();
    const interval = setInterval(() => {
      liveTime = explicitTime ?? formatRealTime();
    }, 1000);
    return () => clearInterval(interval);
  });
</script>

<div
  class="smartphone-frame theme-{theme}"
  data-theme={theme}
  aria-label={ariaLabel}
>
  <!-- Dynamic Island / Notch -->
  <div class="phone-notch" aria-hidden="true">
    <span class="notch-island">
      <span class="island-camera"></span>
      <span class="island-mic"></span>
    </span>
  </div>

  <!-- Status Bar -->
  <div class="phone-status-bar" aria-hidden="true">
    <span class="phone-time" data-testid="live-phone-clock">{liveTime}</span>
    <div class="status-indicators">
      <span class="status-signal">5G</span>
      <span class="status-wifi">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
          <path d="M12 4C7.31 4 3.07 5.9 0 8.98L12 21 24 8.98A16.88 16.88 0 0 0 12 4z" />
        </svg>
      </span>
      <span class="status-battery">
        <span class="battery-level"></span>
      </span>
    </div>
  </div>

  <!-- App Header -->
  <div class="phone-app-header">
    <div class="header-main-info">
      <span class="quipu-rhombus" aria-hidden="true">◆</span>
      <span class="header-title">{title}</span>
    </div>
    {#if statusBadge}
      <div class="header-status-badge tone-{statusTone}">
        {#if statusTone === 'live'}
          <span class="pulse-dot-live" aria-hidden="true"></span>
        {:else if statusTone === 'sync'}
          <span class="sync-dot" aria-hidden="true"></span>
        {:else if statusTone === 'offline'}
          <span class="offline-dot" aria-hidden="true"></span>
        {/if}
        <span class="badge-label">{statusBadge}</span>
      </div>
    {/if}
  </div>

  <!-- Screen Content -->
  <div class="phone-screen-content">
    {#if children}
      {@render children()}
    {/if}
  </div>

  <!-- Home Indicator Bar -->
  <div class="phone-home-bar" aria-hidden="true">
    <span class="home-indicator"></span>
  </div>
</div>

<style>
  .smartphone-frame {
    position: relative;
    width: 380px;
    max-width: 100%;
    height: 690px;
    min-height: 690px;
    max-height: 690px;
    margin: 0 auto;
    border-radius: 32px;
    padding: 0.75rem 1rem 0.85rem;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-family: var(--font-sans);
    transition: all 0.3s ease;
  }

  /* Dark Theme Chassis (OLED Titanium) */
  .smartphone-frame.theme-dark {
    background: #0b0e14;
    border: 3.5px solid #333842;
    color: var(--paper);
    box-shadow:
      0 25px 60px -12px rgba(0, 0, 0, 0.7),
      0 0 0 1px rgba(255, 255, 255, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }

  /* Light Theme Chassis (Ceramic Silver) */
  .smartphone-frame.theme-light {
    background: #ffffff;
    border: 3.5px solid #cbd5e1;
    color: var(--ink);
    box-shadow:
      0 25px 60px -12px rgba(20, 22, 28, 0.18),
      0 0 0 1px rgba(20, 22, 28, 0.06),
      inset 0 1px 0 rgba(255, 255, 255, 0.8);
  }

  /* Dynamic Island Notch */
  .phone-notch {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 18px;
    margin-bottom: 0.15rem;
    flex-shrink: 0;
  }

  .notch-island {
    width: 78px;
    height: 18px;
    background: #000000;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    box-shadow: inset 0 0 2px rgba(255, 255, 255, 0.2);
  }

  .island-camera {
    width: 7px;
    height: 7px;
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 50%;
  }

  .island-mic {
    width: 4px;
    height: 4px;
    background: #1f2937;
    border-radius: 50%;
  }

  /* Status Bar */
  .phone-status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.1rem 0.35rem 0.4rem;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .theme-dark .phone-status-bar {
    color: rgba(243, 239, 230, 0.7);
  }

  .theme-light .phone-status-bar {
    color: rgba(20, 22, 28, 0.7);
  }

  .status-indicators {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .status-signal {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .status-wifi {
    display: flex;
    align-items: center;
  }

  .status-battery {
    width: 16px;
    height: 9px;
    border: 1px solid currentColor;
    border-radius: 2.5px;
    padding: 1px;
    display: flex;
    align-items: center;
    position: relative;
  }

  .status-battery::after {
    content: '';
    position: absolute;
    right: -3px;
    top: 2px;
    width: 1.5px;
    height: 3px;
    background: currentColor;
    border-radius: 0 1px 1px 0;
  }

  .battery-level {
    width: 80%;
    height: 100%;
    background: currentColor;
    border-radius: 1px;
  }

  /* App Header */
  .phone-app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.35rem 0.2rem 0.6rem;
    border-bottom: 1px solid rgba(243, 239, 230, 0.08);
    margin-bottom: 0.55rem;
    flex-shrink: 0;
  }

  .theme-light .phone-app-header {
    border-bottom-color: rgba(20, 22, 28, 0.08);
  }

  .header-main-info {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .quipu-rhombus {
    color: var(--amber-bright);
    font-size: 0.75rem;
  }

  .header-title {
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  .theme-dark .header-title {
    color: var(--paper);
  }

  .theme-light .header-title {
    color: var(--ink);
  }

  /* Status Badges */
  .header-status-badge {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.45rem;
    border-radius: 12px;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .header-status-badge.tone-live {
    background: rgba(46, 158, 116, 0.16);
    color: #34d399;
    border: 1px solid rgba(52, 211, 153, 0.3);
  }

  .theme-light .header-status-badge.tone-live {
    background: rgba(16, 185, 129, 0.12);
    color: #059669;
    border-color: rgba(16, 185, 129, 0.3);
  }

  .header-status-badge.tone-sync {
    background: rgba(229, 169, 59, 0.16);
    color: var(--amber-bright);
    border: 1px solid rgba(229, 169, 59, 0.3);
  }

  .header-status-badge.tone-offline {
    background: rgba(217, 106, 60, 0.16);
    color: var(--alerta-bright);
    border: 1px solid rgba(217, 106, 60, 0.3);
  }

  .pulse-dot-live {
    width: 6px;
    height: 6px;
    background: #34d399;
    border-radius: 50%;
    box-shadow: 0 0 8px #34d399;
    animation: livePulse 2s infinite ease-in-out;
  }

  .theme-light .pulse-dot-live {
    background: #059669;
    box-shadow: 0 0 6px #059669;
  }

  @keyframes livePulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.35); opacity: 0.45; }
  }

  .sync-dot {
    width: 6px;
    height: 6px;
    background: var(--amber-bright);
    border-radius: 50%;
  }

  .offline-dot {
    width: 6px;
    height: 6px;
    background: var(--alerta-bright);
    border-radius: 50%;
  }

  /* Content area */
  .phone-screen-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Home Bar */
  .phone-home-bar {
    display: flex;
    justify-content: center;
    padding-top: 0.55rem;
    flex-shrink: 0;
  }

  .home-indicator {
    width: 95px;
    height: 3.5px;
    border-radius: 2px;
  }

  .theme-dark .home-indicator {
    background: rgba(243, 239, 230, 0.3);
  }

  .theme-light .home-indicator {
    background: rgba(20, 22, 28, 0.25);
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse-dot-live {
      animation: none;
    }
  }
</style>