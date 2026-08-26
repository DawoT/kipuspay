<script lang="ts">
  export type IconName =
    | 'lightning'
    | 'smartphone'
    | 'shield-check'
    | 'sync'
    | 'cart'
    | 'cloud-upload'
    | 'institution'
    | 'document';

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
  {:else if name === 'document'}
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
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
