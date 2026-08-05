import { describe, expect, it } from 'vitest';
import { BLOG_POSTS, postBySlug, publishedPosts } from './blog.js';

describe('blog content', () => {
  it('expone posts publicados sin jerga tecnica', () => {
    const posts = publishedPosts();
    expect(posts.length).toBeGreaterThanOrEqual(3);
    const blob = posts.map((p) => `${p.title} ${p.body}`).join(' ');
    expect(blob).not.toMatch(/\b(PSE|CDR|UBL|ACID|D1|Edge)\b/i);
    expect(postBySlug('recomienda-y-gana-un-mes')?.slug).toBe('recomienda-y-gana-un-mes');
    expect(BLOG_POSTS.every((p) => p.slug.length > 0)).toBe(true);
  });
});
