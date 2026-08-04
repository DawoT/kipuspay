/** @type {import('size-limit').SizeLimitConfig} */
export default [
  {
    name: 'marketing-web client chunks',
    path: '.svelte-kit/output/client/_app/immutable/**/*.js',
    limit: '72 kB',
    gzip: true,
  },
];
