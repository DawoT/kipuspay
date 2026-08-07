/** Stub cloudflare:workers para Vitest (DO real solo en workerd). */
export class DurableObject {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly env: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(ctx: any, env: any) {
    this.ctx = ctx;
    this.env = env;
  }
}
