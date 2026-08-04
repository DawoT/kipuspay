import { error } from '@sveltejs/kit';
import { COMPETITOR_SLUGS, getCompare } from '$lib/content/compare';

export function entries(): Array<{ competidor: string }> {
  return COMPETITOR_SLUGS.map((competidor) => ({ competidor }));
}

export function load({ params }: { params: { competidor: string } }) {
  const page = getCompare(params.competidor);
  if (!page) error(404, 'Comparativa no encontrada');
  return { page };
}
