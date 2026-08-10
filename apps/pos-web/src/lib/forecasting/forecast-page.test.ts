import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../routes/owner/previsiones/+page.svelte', import.meta.url),
  'utf8',
);

describe('Sprint 46 owner forecast UI contract (GREEN)', () => {
  it('gates the view behind OWNER_MODE and ANALYTICS_FORECASTING and never fakes data', () => {
    expect(source).toContain('isOwnerModeEnabled()');
    expect(source).toContain('isAnalyticsForecastingEnabled()');
    expect(source).toContain('Sin pronósticos');
  });

  it('shows cards, model badge, breakage alerts and the disclaimer', () => {
    expect(source).toContain('Previsiones de venta');
    expect(source).toContain('model_version');
    expect(source).toContain('{disclaimer}');
    expect(source).toContain('Riesgo de quiebre');
    expect(source).toContain('suggestedReorderQty');
    expect(source).toContain('daysCovered');
    expect(source).toContain('forecast_date');
    expect(source).toContain('predicted_gross_cents');
  });

  it('exposes refresh and branch controls with accessible test ids', () => {
    expect(source).toMatch(/data-testid="owner-forecast-refresh"/);
    expect(source).toMatch(/data-testid="owner-forecast-branch"/);
    expect(source).toMatch(/data-testid="owner-forecast-list"/);
    expect(source).toMatch(/data-testid="owner-forecast-alerts"/);
  });

  it('keeps amounts integer-cents formatted and adds the non-guarantee caveat', () => {
    expect(source).toContain('formatCents(f.predicted_gross_cents)');
    expect(source).toContain('⚠ {disclaimer}');
  });
});
