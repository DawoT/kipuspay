declare global {
  namespace App {}
}

declare module 'svelte/elements' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface HTMLAttributes<T> {
    'webkit-playsinline'?: boolean | string | null;
  }
}

export {};
