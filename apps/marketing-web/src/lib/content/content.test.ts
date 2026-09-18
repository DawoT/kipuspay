import { describe, expect, it } from 'vitest';
import { claimBadge, resolveClaim } from '../claims/registry.js';
import {
  allCompares,
  COMPARE_ROWS,
  COMPETITOR_SLUGS,
  compareDisclaimer,
  getCompare,
} from './compare.js';
import { HOME } from './home.js';
import { allVerticals, getVertical, otherVerticals, VERTICAL_SLUGS } from './verticals.js';

describe('content model', () => {
  it('seis verticales con dolor, gancho y claim-gate', () => {
    expect(VERTICAL_SLUGS).toHaveLength(6);
    for (const v of allVerticals()) {
      expect(v.pain.length).toBeGreaterThan(10);
      expect(v.hook.length).toBeGreaterThan(10);
      expect(v.points.length).toBeGreaterThanOrEqual(2);
      expect(v.heroPoster).not.toMatch(/hero-poster\.svg/);
      expect(v.heroPoster).toMatch(/\.(png|jpg|jpeg|webp)$/);
      const status = resolveClaim(v.featuredClaimId);
      const badge = claimBadge(status);
      if (status.kind === 'roadmap') {
        expect(badge).toContain(`Sprint ${status.unlockSprint}`);
        expect(badge).not.toBe('Disponible');
      }
    }
  });

  it('slug desconocido → null', () => {
    expect(getVertical('otro')).toBeNull();
    expect(getCompare('otro')).toBeNull();
    expect(getVertical('restaurantes')?.title).toBe('KipusPay para restaurantes');
    expect(getCompare('bsale')?.name).toBe('Bsale');
  });

  it('tres competidores', () => {
    expect(COMPETITOR_SLUGS).toEqual(['bsale', 'alegra', 'siigo']);
    expect(getCompare('bsale')?.name).toBe('Bsale');
  });
});

describe('home — arco narrativo GTM §5', () => {
  it('sección offline (5.4): dolor + comparación honesta', () => {
    expect(HOME.offline.headline).toContain('internet');
    expect(HOME.offline.body.length).toBeGreaterThan(60);
    expect(HOME.offline.withOthers.length).toBeGreaterThan(3);
    expect(HOME.offline.withKipus.length).toBeGreaterThan(3);
  });

  it('sección ledger (5.5): cada sol cuadra', () => {
    expect(HOME.ledger.headline).toMatch(/financiero|sol a sol/i);
    expect(HOME.ledger.points).toHaveLength(3);
  });

  it('sección Modo Dueño (5.6) con nota de plan', () => {
    expect(HOME.owner.headline).toContain('sin estar');
    expect(HOME.owner.note).toMatch(/plan/i);
  });

  it('confianza (5.7.1): cuatro pilares sin prometer de más', () => {
    expect(HOME.trust.items).toHaveLength(4);
    const titles = HOME.trust.items.map((i) => i.title).join(' ');
    expect(titles).toMatch(/cifrada/i);
    expect(titles).toMatch(/habilitación/i);
  });

  it('FAQ (5.9): objeciones reales, mínimo 8', () => {
    expect(HOME.faq.length).toBeGreaterThanOrEqual(8);
    for (const item of HOME.faq) {
      expect(item.q).toMatch(/^¿/);
      expect(item.a.length).toBeGreaterThan(20);
    }
  });

  it('FAQ cubre el playbook del documento maestro: export al cancelar y crédito (M4C)', () => {
    const faq = HOME.faq
      .map((item) => `${item.q} ${item.a}`)
      .join(' ')
      .toLowerCase();
    expect(faq).toMatch(/exporta/);
    expect(faq).toMatch(/csv/);
    expect(faq).toMatch(/cr[eé]dito/);
  });

  it('CTA final (5.10)', () => {
    expect(HOME.finalCta.headline).toContain('KipusPay');
    expect(HOME.finalCta.cta).toMatch(/Probar gratis|Empieza/);
    expect(HOME.finalCta.microcopy).toMatch(/30 días/);
  });
});

describe('home — honestidad de claims (GTM §4.1.1 / GTM-12)', () => {
  const nonPricingSections = JSON.stringify([
    HOME.offline,
    HOME.ledger,
    HOME.owner,
    HOME.trust,
    HOME.finalCta,
    HOME.steps,
  ]);

  it('sin precios ni cupos fuera de la página de precios (GTM-04, frontera S11)', () => {
    expect(nonPricingSections).not.toContain('S/');
    expect(nonPricingSections).not.toMatch(/S\/\s?\d+/);
  });

  it('sin prueba social inventada (GTM-12)', () => {
    const all = JSON.stringify(HOME);
    expect(all).not.toMatch(/ya venden|miles de|clientes felices|más de \d+ comercios/);
  });

  it('FAQ sin siglas internas baneadas', () => {
    const faqText = HOME.faq.map((f) => `${f.q} ${f.a}`).join(' ');
    expect(faqText).not.toMatch(/\b(PSE|CDR|UBL|ACID)\b/i);
  });

  it('activación invita a avanzar sin prometer una duración universal', () => {
    expect(HOME.activation).toMatch(/paso a paso/i);
    expect(HOME.activation).not.toMatch(/\b5 minutos\b/i);
  });

  it('no publica claims fiscales bloqueados ni presenta datos como tiempo real', () => {
    const visibleClaimCopy = JSON.stringify(HOME);

    expect(visibleClaimCopy).not.toMatch(
      /factura en automático|100% legal|en tiempo real|enviamos tus comprobantes|se encarga del envío|guiamos el envío|reintenta el envío|envío de comprobantes|emisión y el estado de comprobantes|se acerca al plazo|plazo de declaración|estado de tus comprobantes|5 minutos/i,
    );
    expect(visibleClaimCopy).toMatch(
      /las opciones de facturación electrónica dependen de su habilitación/i,
    );
    expect(visibleClaimCopy).toMatch(/SUNAT determina la aceptación/i);
    expect(visibleClaimCopy).toMatch(/a medida que las cajas sincronizan/i);
  });

  it('la tabla comparativa del inicio no inventa fallos de competidores', () => {
    const comparisonCopy = COMPARE_ROWS.map(({ reported, kipus }) => `${reported} ${kipus}`).join(
      ' ',
    );
    expect(comparisonCopy).not.toMatch(
      /se bloquea|exige comprar|semanas de espera|cobro extra|100% legal|en tiempo real|en vivo|envía comprobantes|emisión sunat automática|5 minutos|15 minutos|tickets con días/i,
    );
  });

  it('las páginas comparativas no prometen claims fiscales o de tiempo bloqueados', () => {
    const comparisonPagesCopy = JSON.stringify(allCompares());
    expect(comparisonPagesCopy).not.toMatch(
      /100% legal|factura(?:ción)? autom[aá]tica|(?:en )?tiempo real|en vivo|5 minutos|15 minutos|emite comprobantes|certificado digital gratuito/i,
    );
  });
});

describe('landings verticales — contenido de rubro', () => {
  it('no publica claims universales fiscales, de tiempo real o de activación', () => {
    const verticalCopy = JSON.stringify(allVerticals());
    expect(verticalCopy).not.toMatch(
      /100% legal|factura(?:ción)? autom[aá]tica|(?:en )?tiempo real|5 minutos|15 minutos|se encarga del envío|reintenta el envío|envío de comprobantes/i,
    );
  });

  it('no presenta envío, aceptación ni cálculos fiscales bloqueados como disponibles', () => {
    const verticalCopy = JSON.stringify(
      allVerticals().map((vertical) => ({
        hook: vertical.hook,
        metaDescription: vertical.metaDescription,
        points: vertical.points,
        reliefs: vertical.pains.map((pain) => pain.relief),
        faqAnswers: vertical.faq.map((faq) => faq.a),
        documentLabel: vertical.checkout.documentLabel,
        heroBadges: vertical.heroBadges,
        modules: vertical.modules,
      })),
    );
    expect(verticalCopy).not.toMatch(
      /SUNAT al d[ií]a|emisi[oó]n directa ante SUNAT|emisi[oó]n inmediata de boletas|emisi[oó]n de boletas y facturas|emitir boleta y factura|emitir factura a empresas|validaci[oó]n inmediata de DNI o RUC|detracci[oó]n (?:SUNAT )?autom[aá]tica|detracci[oó]n incluida|facturaci[oó]n electr[oó]nica sin tr[aá]mites/i,
    );
  });

  it('no promete compatibilidad universal ni resultados no medidos en las verticales', () => {
    const verticalCopy = JSON.stringify(
      allVerticals().map((vertical) => ({
        pain: vertical.pain,
        hook: vertical.hook,
        metaDescription: vertical.metaDescription,
        points: vertical.points,
        reliefs: vertical.pains.map((pain) => pain.relief),
        faqAnswers: vertical.faq.map((faq) => faq.a),
        heroBadges: vertical.heroBadges,
        modules: vertical.modules,
      })),
    );
    expect(verticalCopy).not.toMatch(
      /cualquier lector|funciona de inmediato|sin errores manuales|siempre el precio vigente|reporte .* listo en segundos|sin pausas aunque|se reflejan de inmediato|cero comandas .* extraviadas|comprobante independiente|sin descuadres garantizados/i,
    );
  });

  it('cada rubro se nombra, nunca se muestra el slug crudo', () => {
    for (const v of allVerticals()) {
      expect(v.navLabel.length).toBeGreaterThan(4);
      expect(v.navLabel.toLowerCase()).not.toBe(v.slug);
    }
  });

  it('tres dolores en primera persona con alivio e icono', () => {
    for (const v of allVerticals()) {
      expect(v.pains).toHaveLength(3);
      for (const p of v.pains) {
        expect(p.icon.length).toBeGreaterThan(3);
        expect(p.pain.length).toBeGreaterThan(20);
        expect(p.relief.length).toBeGreaterThan(15);
      }
    }
  });

  it('FAQ de rubro: exactamente 5 preguntas operativas por cada vertical (total 30)', () => {
    for (const v of allVerticals()) {
      expect(v.faq).toHaveLength(5);
      for (const f of v.faq) {
        expect(f.q).toMatch(/^¿/);
        expect(f.a.length).toBeGreaterThan(30);
      }
    }
  });

  it('pantalla de cobro de ejemplo: solo centimos enteros positivos', () => {
    for (const v of allVerticals()) {
      expect(v.checkout.lines.length).toBeGreaterThanOrEqual(2);
      expect(v.checkout.caption).toMatch(/Ejemplo/i);
      for (const line of v.checkout.lines) {
        expect(Number.isInteger(line.amount_cents)).toBe(true);
        expect(line.amount_cents).toBeGreaterThan(0);
        expect(Number.isInteger(line.qty)).toBe(true);
      }
    }
  });

  it('el cruce entre rubros ofrece los otros cinco', () => {
    for (const v of allVerticals()) {
      const others = otherVerticals(v.slug);
      expect(others).toHaveLength(5);
      expect(others.map((o) => o.slug)).not.toContain(v.slug);
    }
  });

  it('la pantalla de producto de la home es un ejemplo declarado', () => {
    expect(HOME.product.demo.caption).toMatch(/Ejemplo/i);
    for (const line of HOME.product.demo.lines) {
      expect(Number.isInteger(line.amount_cents)).toBe(true);
    }
  });
});

describe('comparativas — diferenciadas y defendibles', () => {
  it('COMPARE_ROWS contiene 8 filas clave de diferenciación', () => {
    expect(COMPARE_ROWS).toHaveLength(8);
    const expectedLabels = [
      'Cobro continuo en hora punta',
      'Equipos y hardware',
      'Puesta en marcha y migración',
      'Modo Dueño en el celular',
      'Facturación electrónica',
      'Actualizaciones de sistema',
      'Curva de aprendizaje del cajero',
      'Soporte y atención',
    ];
    for (const label of expectedLabels) {
      const row = COMPARE_ROWS.find((r) => r.label === label);
      expect(row, `Fila "${label}" debe existir`).toBeDefined();
      expect(row!.reported.length).toBeGreaterThan(10);
      expect(row!.kipus.length).toBeGreaterThan(10);
    }
  });

  it('cada competidor trae gancho, razones, filas propias y 6 FAQs', () => {
    for (const c of allCompares()) {
      expect(c.hook.length).toBeGreaterThan(15);
      expect(c.whyMigrate).toHaveLength(3);
      expect(c.rows.length).toBeGreaterThanOrEqual(2);
      expect(c.faq).toHaveLength(6);
      for (const f of c.faq) {
        expect(f.q).toMatch(/^¿/);
        expect(f.a.length).toBeGreaterThan(25);
      }
    }
  });

  it('la columna ajena es lo reportado, con descargo que nombra al competidor', () => {
    for (const c of allCompares()) {
      const note = compareDisclaimer(c.name);
      expect(note).toContain(c.name);
      expect(note).toMatch(/No representamos/);
    }
  });

  it('ninguna comparativa afirma algo que el gate no libera', () => {
    const text = JSON.stringify(allCompares());
    expect(text).not.toMatch(/tiempo real continuo|garantizamos|siempre acepta/i);
  });
});

describe('copy del sitio — sin jerga de sprint visible', () => {
  it('los pasos de la home no citan sprints', () => {
    expect(JSON.stringify(HOME.steps)).not.toMatch(/Sprint/i);
  });
});
