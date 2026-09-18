// KipusPay — presupuesto de bundle del POS (CAL-06, Arquitectura §13.8).
// El POS es zero-dependency de render (Web Platform + código vendorizado).
// Límite del cliente: presupuesto 100% = "320 kB" gz (ADR-0040).
export default [
  {
    name: 'client',
    path: '.svelte-kit/output/client/**/*.js',
    limit: '320 kB',
    gzip: true,
  },
];
