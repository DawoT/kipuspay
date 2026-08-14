/**
 * Blog growth-loop — GTM §7.3. Sin jerga técnica (copy-lint).
 * Cada post tiene estructura real: secciones con encabezado, fecha y autor.
 */

export interface BlogSection {
  readonly heading: string;
  readonly body: string;
}

export interface BlogPost {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly publishedAt: string;
  readonly author: string;
  readonly sections: readonly BlogSection[];
  readonly published: boolean;
}

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    slug: 'primera-venta-el-mismo-dia',
    title: 'Tu primera venta el mismo día que te registras',
    excerpt: 'Cómo pasar de abrir la cuenta a cobrar sin pelearte con el cuaderno.',
    publishedAt: '2026-08-01',
    author: 'Equipo KipusPay',
    sections: [
      {
        heading: 'Del registro a la caja en cuatro pasos',
        body: 'Empiezas con el nombre de tu negocio, eliges tu rubro y tu etapa de formalización. Eso es todo el papeleo: la configuración profunda (series, impresora, logo) se completa después, nunca bloquea la primera venta.',
      },
      {
        heading: 'La primera venta, en el mismo día',
        body: 'Vas directo a la caja: escribes el producto, el monto y cobras. Si aún no facturas, la venta sale como nota de venta con su leyenda clara. Cuando actives facturación electrónica, las ventas nuevas salen como boleta o factura y el historial anterior se conserva tal cual.',
      },
      {
        heading: 'Si se corta el internet, no pasa nada',
        body: 'La caja sigue cobrando sin conexión: la venta queda guardada en el dispositivo y se sincroniza sola cuando vuelve la señal. Nadie espera, nada se pierde.',
      },
      {
        heading: 'Qué preparar antes de empezar',
        body: 'Ten a mano el RUC si ya lo tienes (opcional en control interno), el nombre de tu negocio y una lista de los productos que más vendes. Con eso alcanza para la primera venta del día.',
      },
    ],
    published: true,
  },
  {
    slug: 'recomienda-y-gana-un-mes',
    title: 'Recomienda KipusPay y ambos ganan un mes',
    excerpt: 'Un mes gratis para quien refiere y un mes para quien llega por tu invitación.',
    publishedAt: '2026-08-08',
    author: 'Equipo KipusPay',
    sections: [
      {
        heading: 'Negocio recomienda negocio',
        body: 'Quien ya vende con KipusPay sabe si le sirvió. El loop de referidos es simple: un mes gratis para quien refiere y un mes gratis para quien se registra con su enlace.',
      },
      {
        heading: 'Dónde está tu enlace',
        body: 'Desde Modo Dueño copias tu enlace de referido. Lo compartes por WhatsApp con otro dueño de tu rubro y listo.',
      },
      {
        heading: 'Cuándo se acredita',
        body: 'Quien llega por tu enlace completa su primera venta y el mes gratis se suma para los dos. Sin niveles, sin condiciones escondidas y sin esperar a fin de mes: el beneficio se aplica al mes siguiente de la primera venta.',
      },
      {
        heading: 'Por qué funciona',
        body: 'Los dueños confían más en la recomendación de otro dueño que en cualquier anuncio. Cada negocio que recomienda convierte su experiencia en el mejor argumento de venta.',
      },
    ],
    published: true,
  },
  {
    slug: 'control-interno-sin-confundir',
    title: 'Control interno sin confundir a SUNAT ni a tu cliente',
    excerpt: 'La nota de venta dice lo que es. No es boleta. No es contingencia.',
    publishedAt: '2026-08-12',
    author: 'Equipo KipusPay',
    sections: [
      {
        heading: 'Qué es el control interno',
        body: 'Si todavía no terminaste tu trámite de facturación, puedes llevar tu caja con nota de venta: es tu control interno de ventas e inventario, y el ticket deja claro que no es un comprobante autorizado por SUNAT.',
      },
      {
        heading: 'Sin hacerse pasar por boleta',
        body: 'La nota de venta nunca se vende como boleta ni como factura, y tampoco usamos la palabra "contingencia": el camino de producto es activar la facturación cuando estés listo.',
      },
      {
        heading: 'El día que activas facturación',
        body: 'Al activar, las ventas nuevas salen como boleta o factura electrónica y KipusPay se encarga del envío a SUNAT. El historial de notas de venta se conserva tal cual, sin convertir nada en falso.',
      },
      {
        heading: 'Qué cambia para tu caja',
        body: 'Nada: el cobro funciona igual en las dos etapas. Lo único que cambia es el documento que sale y el envío que KipusPay hace por ti.',
      },
    ],
    published: true,
  },
];

export function publishedPosts(posts: readonly BlogPost[] = BLOG_POSTS): BlogPost[] {
  return posts.filter((p) => p.published);
}

export function postBySlug(slug: string, posts: readonly BlogPost[] = BLOG_POSTS): BlogPost | null {
  return publishedPosts(posts).find((p) => p.slug === slug) ?? null;
}
