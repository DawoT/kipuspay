import { describe, expect, it } from 'vitest';
import { BLOG_POSTS, postBySlug, publishedPosts } from './blog.js';

describe('blog content', () => {
  it('expone los 7 artículos publicados sin jerga tecnica', () => {
    const posts = publishedPosts();
    expect(posts).toHaveLength(7);
    const blob = posts
      .map(
        (p) =>
          `${p.title} ${p.excerpt} ${p.sections.map((s) => `${s.heading} ${s.paragraphs.join(' ')}`).join(' ')}`,
      )
      .join(' ');
    expect(blob).not.toMatch(/\b(PSE|CDR|UBL|ACID|D1|Edge|Workers)\b/i);
    expect(blob).not.toMatch(/GTM-\d+/);
    expect(blob).not.toMatch(/Sprint\s+\d+/i);
    expect(BLOG_POSTS.every((p) => p.slug.length > 0)).toBe(true);
  });

  it('recupera artículos por slug correctamente', () => {
    expect(postBySlug('primera-venta-el-mismo-dia')?.title).toContain('Tu primera venta');
    expect(postBySlug('recomienda-y-gana-un-mes')?.title).toContain('Recomienda');
    expect(postBySlug('control-interno-sin-confundir')?.title).toContain('Control interno');
    expect(postBySlug('ruc-10-vs-ruc-20-emitir-boletas')?.category).toBe(
      'Tributación y Formalización',
    );
    expect(postBySlug('como-cuadrar-caja-minimarket')?.category).toBe('Gestión de Mostrador');
    expect(postBySlug('cobrar-yape-plin-evitar-estafas')?.category).toBe('Medios de Pago');
    expect(postBySlug('checklist-abrir-restaurante-cafeteria-peru')?.category).toBe('Gastronomía');
    expect(postBySlug('slug-inexistente')).toBeNull();
  });

  it('cada artículo cuenta con metadatos completos y cover válido', () => {
    for (const post of BLOG_POSTS) {
      expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(post.audience.length).toBeGreaterThan(10);
      expect(post.excerpt.length).toBeGreaterThan(30);
      expect(post.coverImage).toMatch(/^\/media\/blog\/[\w-]+\.jpg$/);
      expect(post.coverAlt.length).toBeGreaterThan(10);
      expect(post.readingTimeMinutes).toBeGreaterThanOrEqual(3);
      expect(post.category.length).toBeGreaterThan(3);
      expect(post.tags.length).toBeGreaterThanOrEqual(3);
      expect(post.sections.length).toBeGreaterThanOrEqual(4);

      for (const section of post.sections) {
        expect(section.heading.length).toBeGreaterThan(5);
        expect(section.paragraphs.length).toBeGreaterThanOrEqual(2);
        for (const p of section.paragraphs) {
          expect(p.length).toBeGreaterThan(40);
        }
      }
    }
  });

  it('cada artículo incluye CTA contextual con destino válido', () => {
    for (const post of BLOG_POSTS) {
      expect(post.contextualCta).toBeDefined();
      if (post.contextualCta) {
        expect(post.contextualCta.title.length).toBeGreaterThan(5);
        expect(post.contextualCta.description.length).toBeGreaterThan(15);
        expect(post.contextualCta.buttonText.length).toBeGreaterThan(3);
        expect(post.contextualCta.buttonHref.startsWith('/')).toBe(true);
      }
    }
  });

  it('los artículos tienen densidad de lectura sustancial', () => {
    for (const post of BLOG_POSTS) {
      const totalChars = post.sections.reduce(
        (acc, s) => acc + s.paragraphs.reduce((pAcc, p) => pAcc + p.length, 0),
        0,
      );
      expect(totalChars).toBeGreaterThan(600);
    }
  });
});
