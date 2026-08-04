import { describe, expect, it } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  isCpePortalEnabled,
  isFiscalRcEnabled,
  runFiscalCronHttp,
  runVoidBoletaHttp,
} from './fiscal-rc-routes.js';

describe('fiscal-rc routes flags', () => {
  it('FEATURE_FISCAL_RC / FEATURE_CPE_PORTAL default off', () => {
    expect(isFiscalRcEnabled({} as WorkerEnv)).toBe(false);
    expect(isFiscalRcEnabled({ FEATURE_FISCAL_RC: '0' } as WorkerEnv)).toBe(false);
    expect(isFiscalRcEnabled({ FEATURE_FISCAL_RC: '1' } as WorkerEnv)).toBe(true);
    expect(isCpePortalEnabled({ FEATURE_CPE_PORTAL: '0' } as WorkerEnv)).toBe(false);
    expect(isCpePortalEnabled({ FEATURE_CPE_PORTAL: '1' } as WorkerEnv)).toBe(true);
  });

  it('flag off → 404 void y cron', async () => {
    const voidRes = await runVoidBoletaHttp({ FEATURE_FISCAL_RC: '0' } as WorkerEnv, 't1', 's1');
    expect(voidRes.status).toBe(404);
    const cron = await runFiscalCronHttp({ FEATURE_FISCAL_RC: '0' } as WorkerEnv, {
      action: 'deadlines',
    });
    expect(cron.status).toBe(404);
  });
});
