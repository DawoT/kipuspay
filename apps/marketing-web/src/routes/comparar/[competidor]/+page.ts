import { redirect } from '@sveltejs/kit';

/**
 * M5B — las comparativas se unificaron en una sola página.
 * Las URLs viejas redirigen 301 al selector ?vs= para conservar SEO/backlinks.
 */
export const prerender = false;

export function load({ params }: { params: { competidor?: string } }) {
  const vs = encodeURIComponent(params.competidor ?? 'bsale');
  redirect(301, `/comparar?vs=${vs}`);
}
