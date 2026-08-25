/**
 * Casos de éxito y simulaciones operativas — GTM §7.3 / GTM-12.
 * Solo `permissionGranted: true` puede mostrarse como testimonio vivo.
 * Campo `rubro` (content slug) — no fork UI por vertical (ADR-ARCH-002 / V-07).
 */

import type { VerticalSlug } from './types.js';

export interface SuccessCase {
  readonly id: string;
  readonly rubro: VerticalSlug;
  readonly businessName: string;
  readonly quote: string;
  readonly permissionGranted: boolean;
  readonly published: boolean;
}

export interface SimulationMetric {
  readonly label: string;
  readonly before: string;
  readonly withKipus: string;
  readonly improvement: string;
}

export interface CaseStudySimulation {
  readonly id: string;
  readonly rubro: VerticalSlug;
  readonly archetype: string;
  readonly location: string;
  readonly dailyTransactions: string;
  readonly headline: string;
  readonly operationalChallenge: string;
  readonly kipusSolution: string;
  readonly metrics: readonly SimulationMetric[];
  readonly ownerTakeaway: string;
}

/** Soft-launch: sin permisos reales -> lista publicable vacía (empty state honesto GTM-12). */
export const SUCCESS_CASES: readonly SuccessCase[] = [];

/**
 * Simulaciones de impacto operativo en mostrador peruano.
 * Comparativas antes vs con KipusPay basadas en tiempos y flujos reales de atención.
 */
export const CASE_STUDY_SIMULATIONS: readonly CaseStudySimulation[] = [
  {
    id: 'cafeteria-especialidad',
    rubro: 'restaurantes',
    archetype: 'Cafetería de Especialidad y Brunch',
    location: 'Miraflores, Lima',
    dailyTransactions: '180 tickets/día',
    headline: 'De colas de 12 minutos en hora punta a despacho ágil en 45 segundos',
    operationalChallenge:
      'En las mañanas, la fila de clientes para café y tostadas colapsaba la caja. El sistema anterior demoraba 35 segundos por comanda y cuando el wifi fallaba, se paralizaba todo el mostrador.',
    kipusSolution:
      'Caja rápida con catálogo visual de alta frecuencia, notas de cocina al instante y cobro continuo que sincroniza en segundo plano sin interrumpir el servicio.',
    metrics: [
      {
        label: 'Tiempo de emisión de ticket',
        before: '35 s',
        withKipus: '6 s',
        improvement: '-83% tiempo en caja',
      },
      {
        label: 'Tiempo de cuadre de turno',
        before: '45 min',
        withKipus: '3 min',
        improvement: '-93% tiempo de cierre',
      },
      {
        label: 'Ventas perdidas por caídas de red',
        before: '8 a 12 tickets/semana',
        withKipus: '0 tickets perdidos',
        improvement: '100% continuidad de cobro',
      },
    ],
    ownerTakeaway:
      'El personal aprende a usar la caja en 5 minutos y no volvemos a perder una venta cuando el internet del local parpadea.',
  },
  {
    id: 'minimarket-barrio',
    rubro: 'retail',
    archetype: 'Minimarket y Tienda de Abarrotes',
    location: 'Los Olivos, Lima',
    dailyTransactions: '320 tickets/día',
    headline:
      'Control exacto de caja multicanal (Efectivo, Billeteras Digitales y Tarjetas) sin descuadres al cierre',
    operationalChallenge:
      'Dos turnos de cajeros distintos. Al final del día, cuadrar los cobros de billeteras digitales, efectivo y tarjetas tomaba más de una hora con constantes descuadres acumulados en el mes.',
    kipusSolution:
      'Arqueo de caja por turnos con separación automática de medios de pago, Modo Dueño en el celular para monitorear ingresos en vivo y comprobantes emitidos en segundos.',
    metrics: [
      {
        label: 'Tiempo de cierre de caja por turno',
        before: '60 min',
        withKipus: '4 min',
        improvement: '-93% tiempo de arqueo',
      },
      {
        label: 'Descuadre promedio mensual',
        before: 'S/ 450 en mermas y errores',
        withKipus: 'S/ 0 en caja',
        improvement: 'Cero descuadres de efectivo',
      },
      {
        label: 'Tiempo de registro con código de barras',
        before: '8 s por producto',
        withKipus: '1.5 s por producto',
        improvement: '5x más rápido en cola',
      },
    ],
    ownerTakeaway:
      'Desde mi teléfono sé cuánto vendió cada cajero antes de que cierren la reja del minimarket.',
  },
  {
    id: 'botica-independiente',
    rubro: 'farmacias',
    archetype: 'Botica de Barrio y Cuidado Personal',
    location: 'Trujillo, La Libertad',
    dailyTransactions: '210 tickets/día',
    headline: 'Venta fraccionada por pastilla y emisión electrónica inmediata con cero trabas',
    operationalChallenge:
      'Cobrar blísteres y pastillas sueltas requería cálculos manuales en calculadora. La emisión de boleta electrónica demoraba demasiado por lentitud del sistema anterior.',
    kipusSolution:
      'Búsqueda rápida por nombre comercial o principio activo, soporte nativo para fracción y caja optimizada para impresión de ticket térmico al instante.',
    metrics: [
      {
        label: 'Búsqueda y selección de medicamento',
        before: '20 s',
        withKipus: '3 s',
        improvement: '-85% tiempo de búsqueda',
      },
      {
        label: 'Emisión y entrega de comprobante',
        before: '40 s',
        withKipus: '5 s',
        improvement: '-87% tiempo de emisión',
      },
      {
        label: 'Capacitación de nuevo personal',
        before: '4 días',
        withKipus: '30 minutos',
        improvement: 'Adopción inmediata',
      },
    ],
    ownerTakeaway:
      'El mostrador no se traba ni cuando atendemos recetas largas en horas pico de la tarde.',
  },
];

export function publishedCases(cases: readonly SuccessCase[] = SUCCESS_CASES): SuccessCase[] {
  return cases.filter((c) => c.permissionGranted && c.published);
}

export function casesForRubro(
  rubro: VerticalSlug,
  cases: readonly SuccessCase[] = SUCCESS_CASES,
): SuccessCase[] {
  return publishedCases(cases).filter((c) => c.rubro === rubro);
}

export function allSimulations(): CaseStudySimulation[] {
  return [...CASE_STUDY_SIMULATIONS];
}
