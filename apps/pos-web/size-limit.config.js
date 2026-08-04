// KipusPay — presupuesto de bundle del POS (CAL-06, Arquitectura §13.8).
// El POS es zero-dependency de render (Web Platform + código vendorizado).
// Límite del cliente: presupuesto 100% = "300 kB" gz.
export default [
  {
    name: 'client',
    path: '.svelte-kit/output/client/**/*.js',
    limit: '300 kB',
    gzip: true,
  },
];
