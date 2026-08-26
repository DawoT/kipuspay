import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PHONE_FRAME = readFileSync(new URL('./PhoneMockFrame.svelte', import.meta.url), 'utf8');
const CHECKOUT_MOCK = readFileSync(
  new URL('../brand/CheckoutMock.svelte', import.meta.url),
  'utf8',
);
const OFFLINE_MOCK = readFileSync(new URL('./OfflineDeviceMock.svelte', import.meta.url), 'utf8');
const LEDGER_MOCK = readFileSync(new URL('./LedgerDeviceMock.svelte', import.meta.url), 'utf8');
const OWNER_MOCK = readFileSync(new URL('./OwnerModeMock.svelte', import.meta.url), 'utf8');
const HOME_PAGE = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const APP_CSS = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

// Lista canónica de jerga técnica prohibida (V-26 / GTM §1)
const FORBIDDEN_JARGON = [
  /\bPSE\b/i,
  /\bCDR\b/i,
  /\bUBL\b/i,
  /\bD1\b/i,
  /\bWorkers\b/i,
  /\bEdge\b/i,
  /\bACID\b/i,
  /\bSOAP\b/i,
  /\bendpoint\b/i,
  /\bsharding\b/i,
  /\bDurable\s*Object\b/i,
];

describe('Arquitectura de Mockups de Dispositivos Interactivos (Home KipusPay)', () => {
  describe('1. Regla de Contraste Alternado y Chasis Universal PhoneMockFrame', () => {
    it('PhoneMockFrame fija dimensiones universales idénticas (380px ancho, 690px alto)', () => {
      expect(PHONE_FRAME).toMatch(/width:\s*380px;/);
      expect(PHONE_FRAME).toMatch(/height:\s*690px;/);
      expect(PHONE_FRAME).toMatch(/min-height:\s*690px;/);
      expect(PHONE_FRAME).toMatch(/max-height:\s*690px;/);
      expect(PHONE_FRAME).toContain('border-radius: 32px');
      expect(PHONE_FRAME).toContain('border: 3.5px solid');
    });

    it('PhoneMockFrame sincroniza el reloj con la hora real local en tiempo real', () => {
      expect(PHONE_FRAME).toContain('formatRealTime');
      expect(PHONE_FRAME).toContain('liveTime');
      expect(PHONE_FRAME).toContain('onMount');
      expect(PHONE_FRAME).toContain('setInterval');
      expect(PHONE_FRAME).toContain('data-testid="live-phone-clock"');
    });

    it('CheckoutMock usa PhoneMockFrame en Modo Claro (theme="light") sobre sección oscura #producto', () => {
      expect(CHECKOUT_MOCK).toContain("theme = 'light'");
      expect(CHECKOUT_MOCK).toContain('data-theme={theme}');
      expect(CHECKOUT_MOCK).toContain('PhoneMockFrame');
      expect(HOME_PAGE).toMatch(/<CheckoutMock[\s\S]*?theme="light"/);
    });

    it('OfflineDeviceMock usa PhoneMockFrame en Modo Oscuro (theme="dark") en sección clara #offline', () => {
      expect(OFFLINE_MOCK).toContain('data-theme={theme}');
      expect(OFFLINE_MOCK).toContain('PhoneMockFrame');
      expect(OFFLINE_MOCK).toContain('#141820');
      expect(HOME_PAGE).toMatch(/id="offline"[\s\S]*?<OfflineDeviceMock\s*\/>/);
    });

    it('LedgerDeviceMock usa PhoneMockFrame en Modo Claro (theme="light") en sección oscura #ledger', () => {
      expect(LEDGER_MOCK).toContain('data-theme={theme}');
      expect(LEDGER_MOCK).toContain('PhoneMockFrame');
      expect(LEDGER_MOCK).toContain('#ffffff');
      expect(HOME_PAGE).toMatch(/id="ledger"[\s\S]*?<LedgerDeviceMock\s*\/>/);
    });

    it('OwnerModeMock usa PhoneMockFrame en Modo Oscuro (theme="dark") en sección clara #owner', () => {
      expect(OWNER_MOCK).toContain('PhoneMockFrame');
      expect(OWNER_MOCK).toContain('theme="dark"');
      expect(HOME_PAGE).toMatch(/id="owner"[\s\S]*?<OwnerModeMock\s*\/>/);
    });
  });

  describe('2. Scroll Interno Estilizado (max-height con overflow-y: auto)', () => {
    it('CheckoutMock tiene lista scrolleable de productos (max-height: 180px; overflow-y: auto)', () => {
      expect(CHECKOUT_MOCK).toMatch(/\.lines\s*\{[^}]*max-height:\s*180px;/);
      expect(CHECKOUT_MOCK).toMatch(/\.lines\s*\{[^}]*overflow-y:\s*auto;/);
      expect(CHECKOUT_MOCK).toContain('.lines::-webkit-scrollbar');
    });

    it('OfflineDeviceMock tiene lista scrolleable de comprobantes en cola (max-height: 190px; overflow-y: auto)', () => {
      expect(OFFLINE_MOCK).toMatch(/\.tickets-list\s*\{[^}]*max-height:\s*190px;/);
      expect(OFFLINE_MOCK).toMatch(/\.tickets-list\s*\{[^}]*overflow-y:\s*auto;/);
      expect(OFFLINE_MOCK).toContain('.tickets-list::-webkit-scrollbar');
    });

    it('LedgerDeviceMock tiene lista scrolleable de registros contables (max-height: 190px; overflow-y: auto)', () => {
      expect(LEDGER_MOCK).toMatch(/\.records-list\s*\{[^}]*max-height:\s*190px;/);
      expect(LEDGER_MOCK).toMatch(/\.records-list\s*\{[^}]*overflow-y:\s*auto;/);
      expect(LEDGER_MOCK).toContain('.records-list::-webkit-scrollbar');
    });
  });

  describe('3. Micro-interacciones y Botones Interactivos', () => {
    it('CheckoutMock: botón de cobro interactivo con transición de estado (Procesando... -> Comprobante emitido)', () => {
      expect(CHECKOUT_MOCK).toMatch(/onclick=\{triggerCheckout\}/);
      expect(CHECKOUT_MOCK).toMatch(/disabled=\{isCharging\}/);
      expect(CHECKOUT_MOCK).toContain('Procesando…');
      expect(CHECKOUT_MOCK).toContain('Comprobante emitido ✓');
    });

    it('OfflineDeviceMock: botón de simulación de reconexión y sincronización de cola', () => {
      expect(OFFLINE_MOCK).toMatch(/onclick=\{simulateReconnect\}/);
      expect(OFFLINE_MOCK).toMatch(/disabled=\{isReconnecting\}/);
      expect(OFFLINE_MOCK).toContain('Simular reconexión');
      expect(OFFLINE_MOCK).toContain('Sincronizado con éxito ✓');
      expect(OFFLINE_MOCK).toContain('Guardado en memoria local');
    });

    it('LedgerDeviceMock: botón de verificación de balance que muestra confirmación de caja cuadrada', () => {
      expect(LEDGER_MOCK).toMatch(/onclick=\{verifyBalance\}/);
      expect(LEDGER_MOCK).toMatch(/disabled=\{isVerifying\}/);
      expect(LEDGER_MOCK).toContain('Verificar balance');
      expect(LEDGER_MOCK).toContain('Caja 100% cuadrada sin diferencias');
    });
  });

  describe('4. Invariantes del Proyecto (CAL-01, V-26, Accesibilidad, Performance)', () => {
    it('Manejo de dinero en INTEGER cents con formatCents() (CAL-01)', () => {
      expect(CHECKOUT_MOCK).toContain('formatCents(');
      expect(CHECKOUT_MOCK).not.toMatch(/\.to[F]ixed\s*\(/);

      expect(OFFLINE_MOCK).toContain('formatCents(');
      expect(OFFLINE_MOCK).not.toMatch(/\.to[F]ixed\s*\(/);
      expect(OFFLINE_MOCK).toContain('amount_cents: 3850');
      expect(OFFLINE_MOCK).toContain('amount_cents: 1500');
      expect(OFFLINE_MOCK).toContain('amount_cents: 6200');

      expect(LEDGER_MOCK).toContain('formatCents(');
      expect(LEDGER_MOCK).not.toMatch(/\.to[F]ixed\s*\(/);
      expect(LEDGER_MOCK).toContain('cash_cents: 145000');
      expect(LEDGER_MOCK).toContain('digital_cents: 182000');
      expect(LEDGER_MOCK).toContain('card_cents: 98000');
      expect(LEDGER_MOCK).toContain('total_cents: 445000');
    });

    it('Cero jerga técnica visible en componentes de mockups (V-26)', () => {
      for (const pattern of FORBIDDEN_JARGON) {
        expect(CHECKOUT_MOCK).not.toMatch(pattern);
        expect(OFFLINE_MOCK).not.toMatch(pattern);
        expect(LEDGER_MOCK).not.toMatch(pattern);
        expect(OWNER_MOCK).not.toMatch(pattern);
      }
    });

    it('Todos los botones tienen touch targets >= 44px (min-height: 44px)', () => {
      expect(CHECKOUT_MOCK).toMatch(/\.pay-btn\s*\{[^}]*min-height:\s*44px;/);
      expect(OFFLINE_MOCK).toMatch(/\.reconnect-btn\s*\{[^}]*min-height:\s*44px;/);
      expect(LEDGER_MOCK).toMatch(/\.verify-btn\s*\{[^}]*min-height:\s*44px;/);
    });

    it('Soporte prefers-reduced-motion en animaciones y transiciones', () => {
      expect(CHECKOUT_MOCK).toContain('@media (prefers-reduced-motion: reduce)');
      expect(OFFLINE_MOCK).toContain('@media (prefers-reduced-motion: reduce)');
      expect(LEDGER_MOCK).toContain('@media (prefers-reduced-motion: reduce)');
      expect(OWNER_MOCK).toContain('@media (prefers-reduced-motion: reduce)');
    });
  });

  describe('5. Integración en el Home (+page.svelte y app.css)', () => {
    it('app.css incluye .offline-grid y .ledger-grid con breakpoints normativos (719/899)', () => {
      expect(APP_CSS).toContain('.offline-grid');
      expect(APP_CSS).toContain('.ledger-grid');
      expect(APP_CSS).toMatch(/@media\s*\(min-width:\s*899px\)[\s\S]*?\.offline-grid/);
      expect(APP_CSS).toMatch(/@media\s*\(min-width:\s*899px\)[\s\S]*?\.ledger-grid/);
    });

    it('+page.svelte renderiza las 3 secciones con sus mockups respectivos', () => {
      expect(HOME_PAGE).toContain('CheckoutMock');
      expect(HOME_PAGE).toContain('OfflineDeviceMock');
      expect(HOME_PAGE).toContain('LedgerDeviceMock');
      expect(HOME_PAGE).toContain('offline-grid');
      expect(HOME_PAGE).toContain('ledger-grid');
    });
  });
});
