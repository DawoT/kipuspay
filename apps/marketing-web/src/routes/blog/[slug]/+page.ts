import { publishedPosts } from '$lib/content/blog';

export function entries(): Array<{ slug: string }> {
  return publishedPosts().map((post) => ({ slug: post.slug }));
}
