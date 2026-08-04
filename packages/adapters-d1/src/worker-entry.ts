/**
 * Entry mínima para el pool de Workers en tests de integración.
 * El adaptador se prueba vía binding `env.DB`, no vía HTTP.
 */
export default {
  fetch(): Response {
    return new Response('kipuspay-adapters-d1', { status: 200 });
  },
};
