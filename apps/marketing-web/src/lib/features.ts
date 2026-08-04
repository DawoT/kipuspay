/** Soft-launch flag. Default off. */

function flagOn(value: string | boolean | undefined): boolean {
  return value === '1' || value === 'true' || value === true;
}

export function isMarketingSiteEnabled(): boolean {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return flagOn(import.meta.env.PUBLIC_FEATURE_MARKETING_SITE as string | undefined);
  }
  return false;
}
