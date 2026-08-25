/**
 * Páginas legales del sitio — /terminos, /privacidad y /reclamaciones (M4A).
 * Fuente única: docs/ops/legal_and_sales_guide.md (documento maestro,
 * versión final completa). Principios: cero promesas inventadas, copy de
 * negocio, retención fiscal SUNAT (~5 años) siempre junto al borrado.
 */

export const OFFICIAL_CHANNELS = {
  contacto: 'contacto@kipuspay.com',
  soporte: 'soporte@kipuspay.com',
  privacidad: 'privacidad@kipuspay.com',
  facturacion: 'facturacion@kipuspay.com',
} as const;

export const TERMS_PAGE = {
  title: 'Términos del servicio',
  headline: 'Cómo usamos KipusPay, sin letra chica.',
  lede: 'Lo que sigue es lo que de verdad importa al usar el servicio. Si algo no está claro, escríbenos.',
  sections: [
    {
      id: 'prueba',
      heading: 'Prueba real de 30 días',
      body: 'Empiezas sin tarjeta y con tus datos reales. Decides quedarte solo si te sirve; no hay contratos largos ni instalación. Si al terminar decides no contratar, no hay cobro ni penalidad y puedes exportar tu información comercial.',
    },
    {
      id: 'licencia',
      heading: 'Licencia de uso',
      body: 'KipusPay te da una licencia de uso no exclusiva e intransferible del servicio. Las tarifas en soles incluyen los tributos de ley.',
    },
    {
      id: 'planes',
      heading: 'Planes, cupo y sobregiro',
      body: 'Arranque incluye 1,000 comprobantes al mes; el excedente se factura a S/ 0.05 fuera del cobro. La caja nunca se detiene por volumen ni por un pago de suscripción en periodo de gracia.',
    },
    {
      id: 'documentos',
      heading: 'Nota de venta y comprobantes',
      body: 'La nota de venta de control interno no es un comprobante autorizado por SUNAT y siempre lo decimos en el producto. La aceptación de cada comprobante electrónico depende de SUNAT; nunca afirmamos lo contrario.',
    },
    {
      id: 'cancelacion',
      heading: 'Cancelación y reembolsos',
      body: 'Los planes mensuales se cancelan cuando quieras desde el panel, sin penalidad. En planes anuales, se reembolsa la parte proporcional descontando los meses usados a tarifa mensual, dentro de 15 días hábiles escribiendo a facturacion@kipuspay.com.',
    },
    {
      id: 'sla',
      heading: 'Nivel de servicio',
      body: 'La plataforma se compromete a 99.9% de disponibilidad mensual. Si la caja no cobra, respondemos en 1 hora calendario en Enterprise y en 4 horas hábiles en los demás planes, por soporte@kipuspay.com.',
    },
    {
      id: 'datos',
      heading: 'Tus datos',
      body: 'Los datos de tu negocio son tuyos. Puedes exportar tu catálogo y tus ventas al momento de cancelar; el borrado de datos personales respeta la retención fiscal que exige SUNAT.',
    },
    {
      id: 'reclamaciones',
      heading: 'Reclamaciones',
      body: 'Tienes a disposición nuestro Libro de Reclamaciones Virtual en kipuspay.com/reclamaciones, conforme a la Ley 29571 (Código de Protección y Defensa del Consumidor).',
    },
    {
      id: 'jurisdiccion',
      heading: 'Ley aplicable',
      body: 'Este contrato se rige por las leyes del Perú. Cualquier controversia se resuelve ante el Distrito Judicial de Lima Centro, Perú.',
    },
  ],
} as const;

export const PRIVACY_PAGE = {
  title: 'Privacidad y datos',
  headline: 'Tu información, tratada con reglas claras.',
  lede: 'En qué casos guardamos datos, por qué, y qué puedes pedir como titular.',
  sections: [
    {
      id: 'que-guardamos',
      heading: 'Qué guardamos',
      body: 'Tu negocio guarda lo que registra al vender: comprobantes, clientes y stock. Los datos personales de tus clientes (nombre, correo, teléfono, documento) viven en la copia de datos de tu negocio; nosotros los tratamos solo para que el servicio funcione.',
    },
    {
      id: 'consentimiento',
      heading: 'Consentimiento por propósito',
      body: 'Los mensajes se piden por separado y se explican en una frase: "Mensajes por WhatsApp" y "Promociones y avisos comerciales". Ningún contacto se asume por defecto.',
    },
    {
      id: 'derechos',
      heading: 'Tus derechos como titular',
      body: 'Puedes pedir una copia de los datos que guardamos de ti (exportar). Anonimizar borra los datos personales; los comprobantes fiscales se conservan como exige SUNAT, alrededor de 5 años, sin tu nombre.',
    },
    {
      id: 'arco',
      heading: 'Cómo ejercer tus derechos',
      body: 'Para acceder, rectificar, cancelar u oponerte al tratamiento de tus datos, escríbenos a privacidad@kipuspay.com. Respondemos por el mismo canal con la constancia del trámite, conforme a la Ley 29733 (Protección de Datos Personales) y su reglamento (D.S. 003-2013-JUS).',
    },
    {
      id: 'seguridad',
      heading: 'Cómo protegemos la información',
      body: 'El tráfico hacia KipusPay va cifrado. No guardamos secretos de pago ni claves privadas en texto plano en el dispositivo de caja.',
    },
  ],
} as const;

export const PROVIDER_INFO = {
  razonSocial: 'KipusPay S.A.C.',
  ruc: '20612913251',
  domicilioFiscal: 'Av. Faustino Sánchez Carrión 615, Jesús María, Lima, Perú',
} as const;

export const RECLAMATIONS_PAGE = {
  title: 'Libro de Reclamaciones',
  headline: 'Tu reclamo tiene canal y tiene plazo.',
  lede: 'Conforme a la ley de protección al consumidor, KipusPay pone a tu disposición el Libro de Reclamaciones Virtual.',
  steps: [
    {
      title: 'Registra tu reclamo',
      body: 'Completa el formulario de esta página. Recibirás un número de caso como acuse (Ley 29571). También puedes escribir a contacto@kipuspay.com.',
    },
    {
      title: 'Recibe la constancia',
      body: 'El número de caso en pantalla es tu acuse. Conserva ese número. La constancia por correo está en preparación.',
    },
    {
      title: 'Respuesta en 15 días hábiles',
      body: 'Atendemos tu reclamo dentro del plazo que fija la ley: 15 días hábiles improrrogables desde la recepción, con una respuesta por escrito (Ley N° 31435).',
    },
  ],
} as const;
