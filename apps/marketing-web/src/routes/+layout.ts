import { isMarketingSiteEnabled } from '$lib/features';

export const prerender = true;

export function load() {
  return {
    siteEnabled: isMarketingSiteEnabled(),
  };
}
