import { error } from '@sveltejs/kit';
import { getVertical, VERTICAL_SLUGS } from '$lib/content/verticals';

export function entries(): Array<{ vertical: string }> {
  return VERTICAL_SLUGS.map((vertical) => ({ vertical }));
}

export function load({ params }: { params: { vertical: string } }) {
  const landing = getVertical(params.vertical);
  if (!landing) error(404, 'Vertical no encontrada');
  return { landing };
}
