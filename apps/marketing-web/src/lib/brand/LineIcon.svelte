<script lang="ts">
  /**
   * Iconos de linea de marca: trazo de 2px, esquinas rectas, sin relleno.
   * Dibujados a mano para que no se lean como set descargado (GTM §5.2).
   */
  import type { IconName } from './icons';

  interface Props {
    name: IconName;
    size?: number;
  }

  let { name, size = 20 }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="square"
  stroke-linejoin="miter"
  aria-hidden="true"
>
  {#if name === 'reloj'}
    <rect x="3" y="3" width="18" height="18" />
    <path d="M12 7v5.5l3.5 2" />
  {:else if name === 'senal'}
    <path d="M3 9.5c5-4 13-4 18 0" />
    <path d="M6.5 13.5c3.3-2.6 7.7-2.6 11 0" />
    <path d="M10 17.5l2 2 2-2" />
    <path d="M4 4l16 16" />
  {:else if name === 'balanza'}
    <path d="M12 4v16" />
    <path d="M5 8h14" />
    <path d="M3 15l3-6 3 6" />
    <path d="M15 15l3-6 3 6" />
  {:else if name === 'caja'}
    <rect x="3" y="8" width="18" height="12" />
    <path d="M3 12h18" />
    <path d="M10 4h4v4h-4z" />
  {:else if name === 'etiqueta'}
    <path d="M4 4h9l7 7-9 9-7-7z" />
    <path d="M8.5 8.5h.01" />
  {:else if name === 'local'}
    <path d="M3 9l2-5h14l2 5" />
    <path d="M4 9v11h16V9" />
    <path d="M9.5 20v-6h5v6" />
  {:else if name === 'cuaderno'}
    <rect x="5" y="3" width="14" height="18" />
    <path d="M5 8h14M5 13h14M5 18h9" />
  {:else if name === 'panel'}
    <rect x="3" y="3" width="7.5" height="7.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" />
  {:else if name === 'candado'}
    <rect x="4" y="10" width="16" height="11" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  {:else if name === 'documento'}
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4" />
  {:else if name === 'sello'}
    <rect x="3.5" y="3.5" width="17" height="17" />
    <path d="M8 12.5l3 3 5-6" />
  {:else}
    <circle cx="9" cy="8" r="3.2" />
    <circle cx="17" cy="9" r="2.6" />
    <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
    <path d="M15 14.6c2.3.2 4 1.7 4.6 4.4" />
  {/if}
</svg>
