/** Feature flags cliente (PUBLIC_*). Default off. */

function flagOn(value: string | boolean | undefined): boolean {
  return value === '1' || value === 'true' || value === true;
}

export function isPosCheckoutEnabled(): boolean {
  return flagOn(import.meta.env.PUBLIC_FEATURE_POS_CHECKOUT as string | undefined);
}

export function isPrintTemplatesEnabled(): boolean {
  return flagOn(import.meta.env.PUBLIC_FEATURE_PRINT_TEMPLATES as string | undefined);
}

export function isVitrinaEnabled(): boolean {
  return flagOn(import.meta.env.PUBLIC_FEATURE_VITRINA as string | undefined);
}
