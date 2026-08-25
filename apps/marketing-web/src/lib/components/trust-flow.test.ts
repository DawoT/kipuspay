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
const ayuda = readFileSync(new URL('../../routes/ayuda/+page.svelte', import.meta.url), 'utf8');

const FORBIDDEN_TECH_WORDS = /\b(CDR|PSE|UBL|SOAP|Workers|D1|Edge|ACID|sharding|endpoint)\b/;

describe('Sprint 11C — Superficies de Confianza & Micro-interacciones', () => {
  describe('Diagrama interactivo trust-flow en /seguridad', () => {
    it('tiene patron de data-testid="flow-step-{i + 1}" en el template (5 pasos en FLOW_STEPS)', () => {
      // Svelte template: data-testid="flow-step-{i + 1}" — produce flow-step-1..5 en runtime
      expect(seguridad).toContain('data-testid="flow-step-{i + 1}"');
      // El array FLOW_STEPS tiene 5 elementos
      const flowSteps = seguridad.match(/label:\s*'/g);
      expect(flowSteps).not.toBeNull();
      expect(flowSteps!.length).toBeGreaterThanOrEqual(5);
    });

    it('el template declara role="listitem" en el item del bucle', () => {
      // role="listitem" aparece en el template Svelte (renderiza 5 veces en runtime)
      expect(seguridad).toContain('role="listitem"');
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
    it('el template declara role="tab" en el bucle de botones (renderiza 4 tabs)', () => {
      // role="tab" aparece en el template (el {#each} genera 4 instancias en runtime)
      expect(comparar).toContain('role="tab"');
      // Verificamos que hay 4 categorias definidas en CATEGORY_TABS
      expect(comparar).toMatch(/CATEGORY_TABS[\s\S]*?servicios/);
    });

    it('cada tab tiene data-testid con patron "compare-tab-{tab.id}" (Svelte template)', () => {
      expect(comparar).toContain('data-testid="compare-tab-{tab.id}"');
      expect(comparar).toContain("id: 'todos'");
      expect(comparar).toContain("id: 'restaurante'");
      expect(comparar).toContain("id: 'tienda'");
      expect(comparar).toContain("id: 'servicios'");
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
