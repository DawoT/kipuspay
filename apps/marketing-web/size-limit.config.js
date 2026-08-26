/** @type {import('size-limit').SizeLimitConfig} */
export default [
  {
    name: 'marketing-web client chunks',
    path: '.svelte-kit/output/client/_app/immutable/**/*.js',
    // 72→120 kB: revisión ADR-0038 (contenido editorial prerrenderizado;
    // criterio real = Core Web Vitals). Superar 120 kB exige revisar el ADR.
    limit: '120 kB',
    gzip: true,
  },
];
