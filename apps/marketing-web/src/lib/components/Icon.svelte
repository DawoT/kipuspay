<script lang="ts">
  export type IconName =
    | 'lightning'
    | 'smartphone'
    | 'shield-check'
    | 'sync'
    | 'cart'
    | 'cloud-upload'
    | 'institution'
    | 'document'
    | 'documento'
    | 'panel'
    | 'balanza'
    | 'etiqueta'
    | 'reloj'
    | 'senal'
    | 'caja'
    | 'local'
    | 'cuaderno'
    | 'candado'
    | 'sello'
    | 'personas'
    | 'fuel'
    | 'gas';

  interface Props {
    name: IconName | (string & {});
    size?: number;
    tone?: 'amber' | 'jade' | 'paper' | 'current';
    class?: string;
  }

  let { name, size = 20, tone = 'current', class: className = '' }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="k-icon {className}"
  class:tone-amber={tone === 'amber'}
  class:tone-jade={tone === 'jade'}
  class:tone-paper={tone === 'paper'}
  aria-hidden="true"
  data-icon={name}
>
  {#if name === 'lightning'}
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  {:else if name === 'smartphone'}
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
  {:else if name === 'shield-check'}
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  {:else if name === 'sync'}
    <path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4" />
    <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" />
  {:else if name === 'cart'}
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  {:else if name === 'cloud-upload'}
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  {:else if name === 'institution'}
    <path d="M2 10L12 3l10 7" />
    <line x1="4" y1="10" x2="20" y2="10" />
    <line x1="6" y1="10" x2="6" y2="18" />
    <line x1="10" y1="10" x2="10" y2="18" />
    <line x1="14" y1="10" x2="14" y2="18" />
    <line x1="18" y1="10" x2="18" y2="18" />
    <line x1="3" y1="18" x2="21" y2="18" />
    <line x1="2" y1="21" x2="22" y2="21" />
  {:else if name === 'document' || name === 'documento'}
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  {:else if name === 'panel'}
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  {:else if name === 'balanza'}
    <path d="M12 3v18" />
    <path d="M6 7h12" />
    <path d="M3 13l3-6 3 6" />
    <path d="M15 13l3-6 3 6" />
    <path d="M2 13a4 4 0 0 0 8 0" />
    <path d="M14 13a4 4 0 0 0 8 0" />
  {:else if name === 'etiqueta'}
    <path d="M12.5 2H6a2 2 0 0 0-2 2v6.5a2 2 0 0 0 .59 1.41l8.5 8.5a2 2 0 0 0 2.83 0l5.17-5.17a2 2 0 0 0 0-2.83l-8.5-8.5A2 2 0 0 0 12.5 2z" />
    <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" />
  {:else if name === 'reloj'}
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 15" />
  {:else if name === 'senal'}
    <path d="M2 20h.01" />
    <path d="M7 20v-4" />
    <path d="M12 20v-8" />
    <path d="M17 20V8" />
    <path d="M22 20V4" />
  {:else if name === 'caja'}
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  {:else if name === 'local'}
    <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
    <path d="M2 7h20" />
  {:else if name === 'cuaderno'}
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
    <path d="M6 6h10" />
    <path d="M6 10h10" />
    <path d="M6 14h10" />
  {:else if name === 'candado'}
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  {:else if name === 'sello'}
    <circle cx="12" cy="12" r="9" />
    <polyline points="8 12 11 15 16 9" />
  {:else if name === 'personas'}
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  {:else if name === 'fuel' || name === 'gas'}
    <path d="M3 22V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17" />
    <path d="M13 10h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9l-3-3" />
    <path d="M3 13h10" />
    <rect x="5" y="6" width="6" height="4" rx="1" />
  {:else}
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 8 12 12 14 14" />
  {/if}
</svg>

<style>
  .k-icon {
    display: inline-block;
    vertical-align: middle;
    flex-shrink: 0;
  }
  .tone-amber {
    color: var(--amber-bright);
  }
  .tone-jade {
    color: var(--sello-bright);
  }
  .tone-paper {
    color: var(--paper);
  }
</style>
