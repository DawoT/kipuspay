/** Stub de $env/dynamic/public para Vitest (lee process.env). */
export const env: Record<string, string | undefined> = new Proxy(
  {},
  {
    get(_t, prop: string) {
      return process.env[prop];
    },
  },
);
