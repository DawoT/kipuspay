import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const seguridad = readFileSync(
  new URL('../../routes/seguridad/+page.svelte', import.meta.url),
  'utf8',
);
const comparar = readFileSync(
  new URL('../../routes/comparar/+page.svelte', import.meta.url),
  'utf8',
);
const ayuda = readFileSync(
  new URL('../../routes/ayuda/+page.svelte', import.meta.url),
  'utf8',
);

const FORBIDDEN_TECH_WORDS = /\b(CDR|PSE|UBL|SOAP|Workers|D1|Edge|ACID|sharding|endpoint)\b/;

describe('Sprint 11C — Superficies de Confianza & Micro-interacciones', () => {
  describe('Diagrama interactivo trust-flow en /seguridad', () => {
    it('tiene 5 pasos con data-testid="flow-step-N"', () => {
      for (let i = 1; i <= 5; i++) {
        expect(seguridad).toContain(`data-testid="flow-step-${i}"`);
      }
    });

    it('cada paso tiene role="listitem"', () => {
      const matches = seguridad.match(/role="listitem"/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(5);
    });

    it('el diagrama visual tiene role="list"', () => {
      expect(seguridad).toContain('role="list"');
    });

    it('el copy del diagrama no contiene jerga tecnica prohibida', () => {
      const flowSection = seguridad.match(/const FLOW_STEPS[\s\S]*?\] as const;/)?.[0] ?? '';
      expect(flowSection).not.toMatch(FORBIDDEN_TECH_WORDS);
    });

    it('los 5 pasos tienen labels en lenguaje de usuario (con tildes reales)', () => {
      expect(seguridad).toContain("label: 'Tu venta'");
      expect(seguridad).toContain("label: 'KipusPay lo recibe'");
      // Accepts the real UTF-8 strings in the source file
      expect(seguridad).toMatch(/label:\s*'Env[íi]o autom[áa]tico'/);
      expect(seguridad).toMatch(/label:\s*'Confirmaci[óo]n oficial'/);
      expect(seguridad).toMatch(/label:\s*'Tu comprobante v[áa]lido'/);
    });

    it('respeta prefers-reduced-motion en las animaciones', () => {
      expect(seguridad).toContain('prefers-reduced-motion: reduce');
    });

    it('los nodos tienen touch target minimo 44px', () => {
      expect(seguridad).toMatch(/min-width:\s*44px/);
      expect(seguridad).toMatch(/min-height:\s*44px/);
    });

    it('tiene aria-label descriptivo en el contenedor de la lista', () => {
      expect(seguridad).toMatch(/aria-label="Pasos del proceso/);
    });
  });

  describe('Selector de categoria en /comparar (compare tabs)', () => {
    it('existen al menos 3 botones con role="tab"', () => {
      const matches = comparar.match(/role="tab"/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(3);
    });

    it('cada tab tiene data-testid que empieza con "compare-tab-"', () => {
      expect(comparar).toContain('data-testid="compare-tab-todos"');
      expect(comparar).toContain('data-testid="compare-tab-restaurante"');
      expect(comparar).toContain('data-testid="compare-tab-tienda"');
      expect(comparar).toContain('data-testid="compare-tab-servicios"');
    });

    it('los tabs tienen aria-selected dinamico', () => {
      expect(comparar).toContain('aria-selected=');
    });

    it('el contenedor tiene role="tablist"', () => {
      expect(comparar).toContain('role="tablist"');
    });

    it('los tabs tienen touch target minimo 44px', () => {
      expect(comparar).toMatch(/min-width:\s*44px/);
      expect(comparar).toMatch(/min-height:\s*44px/);
    });

    it('respeta prefers-reduced-motion en transiciones', () => {
      expect(comparar).toContain('prefers-reduced-motion: reduce');
    });
  });

  describe('Buscador reactivo mejorado en /ayuda', () => {
    it('tiene boton clear-search-btn', () => {
      expect(ayuda).toContain('data-testid="clear-search-btn"');
    });

    it('tiene search-results-count con aria-live="polite"', () => {
      expect(ayuda).toContain('data-testid="search-results-count"');
      expect(ayuda).toContain('aria-live="polite"');
    });

    it('el boton de limpiar tiene aria-label descriptivo', () => {
      // Accepts the actual UTF-8 "búsqueda"
      expect(ayuda).toMatch(/aria-label="Limpiar b[uú]squeda"/);
    });

    it('tiene estado vacio con mensaje amigable', () => {
      expect(ayuda).toContain('data-testid="search-empty-state"');
    });

    it('el estado vacio tiene un CTA de contacto', () => {
      expect(ayuda).toContain('mailto:');
    });

    it('el contador usa plural correcto', () => {
      expect(ayuda).toContain('preguntas encontradas');
      expect(ayuda).toContain('1 pregunta encontrada');
    });

    it('respeta prefers-reduced-motion', () => {
      expect(ayuda).toContain('prefers-reduced-motion: reduce');
    });
  });
});
