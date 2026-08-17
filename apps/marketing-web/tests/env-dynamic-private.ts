/**
 * Stub de vitest para $env/dynamic/private (marketing).
 * Lee process.env en runtime: los tests controlan el valor con vi.stubEnv /
 * set/delete de process.env (patrón handshake.test.ts).
 */
export const env = process.env;
