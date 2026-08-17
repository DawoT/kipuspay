import { redirect } from '@sveltejs/kit';

/**
 * M5B — las comparativas se unificaron en una sola página.
 * Las URLs viejas redirigen 301 al selector ?vs= para conservar SEO/backlinks.
 */
export const prerender = false;

export function load({ params }: { params: { competitor?: string } }) {
  const vs = encodeURIComponent(params.competitor ?? 'bsale');
  redirect(301, `/comparar?vs=${vs}`);
}
