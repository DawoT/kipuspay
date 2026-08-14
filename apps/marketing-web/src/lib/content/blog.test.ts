import { describe, expect, it } from 'vitest';
import { BLOG_POSTS, postBySlug, publishedPosts } from './blog.js';

describe('blog content', () => {
  it('expone posts publicados sin jerga tecnica', () => {
    const posts = publishedPosts();
    expect(posts.length).toBeGreaterThanOrEqual(3);
    const blob = posts
      .map((p) => `${p.title} ${p.sections.map((s) => `${s.heading} ${s.body}`).join(' ')}`)
      .join(' ');
    expect(blob).not.toMatch(/\b(PSE|CDR|UBL|ACID|D1|Edge|Workers)\b/i);
    expect(blob).not.toMatch(/GTM-\d+/);
    expect(blob).not.toMatch(/Sprint\s+\d+/i);
    expect(postBySlug('recomienda-y-gana-un-mes')?.slug).toBe('recomienda-y-gana-un-mes');
    expect(BLOG_POSTS.every((p) => p.slug.length > 0)).toBe(true);
  });

  it('cada post tiene estructura real: secciones, fecha y autor (M3)', () => {
    for (const post of BLOG_POSTS) {
      expect(post.sections.length).toBeGreaterThanOrEqual(3);
      expect(post.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(post.author.length).toBeGreaterThan(0);
      for (const section of post.sections) {
        expect(section.heading.length).toBeGreaterThan(5);
        expect(section.body.length).toBeGreaterThan(80);
      }
    }
  });

  it('las secciones suman más que el párrafo plano anterior (valor M3)', () => {
    for (const post of BLOG_POSTS) {
      const total = post.sections.reduce((acc, s) => acc + s.body.length, 0);
      expect(total).toBeGreaterThan(600);
    }
  });
});
