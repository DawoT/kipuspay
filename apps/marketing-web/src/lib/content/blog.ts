/**
 * Blog growth-loop — GTM §7.3. Sin jerga técnica (copy-lint).
 */

export interface BlogPost {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly body: string;
  readonly published: boolean;
}

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    slug: 'primera-venta-el-mismo-dia',
    title: 'Tu primera venta el mismo dia que te registras',
    excerpt: 'Como pasar de abrir la cuenta a cobrar sin pelearte con el cuaderno.',
    body: 'Empiezas con el nombre de tu negocio, eliges tu rubro y tu etapa. Luego vas directo a la caja. Si aun no facturas, usas nota de venta con leyenda clara. Cuando actives facturacion, las ventas nuevas salen como boleta o factura — el historial se conserva.',
    published: true,
  },
  {
    slug: 'recomienda-y-gana-un-mes',
    title: 'Recomienda KipusPay y ambos ganan un mes',
    excerpt: 'Un mes gratis para quien refiere y un mes para quien llega por tu invitacion.',
    body: 'Desde Modo Dueno copias tu enlace. Quien se registra con ese enlace y completa su primera venta suma un mes para los dos. Sin niveles ni letra chica: negocio recomienda negocio.',
    published: true,
  },
  {
    slug: 'control-interno-sin-confundir',
    title: 'Control interno sin confundir a SUNAT ni a tu cliente',
    excerpt: 'La nota de venta dice lo que es. No es boleta. No es contingencia.',
    body: 'Si todavia no terminaste el tramite, cobras con nota de venta. El ticket deja claro que no es comprobante autorizado. Cuando actives facturacion electronica, KipusPay envia a SUNAT por ti.',
    published: true,
  },
];

export function publishedPosts(posts: readonly BlogPost[] = BLOG_POSTS): BlogPost[] {
  return posts.filter((p) => p.published);
}

export function postBySlug(slug: string, posts: readonly BlogPost[] = BLOG_POSTS): BlogPost | null {
  return publishedPosts(posts).find((p) => p.slug === slug) ?? null;
}
