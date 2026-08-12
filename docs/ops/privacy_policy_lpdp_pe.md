---
doc_id: ops-privacy-policy-lpdp-pe
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Política de Privacidad y Protección de Datos Personales (LPDP Perú)

> **Sitio Web Oficial:** `https://kipuspay.com`  
> **Contacto DPO:** `privacidad@kipuspay.com`  
> **Última actualización:** 12 de agosto de 2026  
> **Marco Legal:** Ley N.º 29733 (Ley de Protección de Datos Personales de Perú) y Decreto Supremo N.º 003-2013-JUS.

---

## 1. Declaración de Compromiso y Finalidad

En **KipusPay** (`https://kipuspay.com`), respetamos y protegemos la privacidad y los datos personales de nuestros usuarios, comercios clientes y de los compradores finales de los establecimientos contratantes.

Esta Política de Privacidad describe cómo recopilamos, utilizamos, almacenamos, tratamos y protegemos la información personal en cumplimiento estricto de la **Ley N.º 29733 (Ley de Protección de Datos Personales de Perú)** y su Reglamento aprobado por **Decreto Supremo N.º 003-2013-JUS**.

---

## 2. Titularidad de los Bancos de Datos Personales

La información tratada a través de la plataforma KipusPay se organiza en los siguientes Bancos de Datos Personales declarados ante la Autoridad Nacional de Protección de Datos Personales (ANPDP) del Ministerio de Justicia y Derechos Humanos de Perú:

1. **Banco de Datos de Clientes y Comercios:** Contiene información de los representantes legales, contactos comerciales y propietarios de los comercios contratantes de KipusPay.
2. **Banco de Datos de Usuarios del Sistema:** Contiene información de los administradores, supervisores y cajeros registrados en las empresas clientes (nombres, correos, PINs cifrados y registros de auditoría).
3. **Banco de Datos de Compradores Finales:** Contiene la información consignada al emitir comprobantes de pago (nombres, DNI/RUC, correo electrónico, teléfono, dirección).

---

## 3. Información Recopilada y Finalidades del Tratamiento

### 3.1 Datos Recopilados
- **Datos de Identificación:** Nombres, apellidos, tipo y número de documento (DNI, CE, Pasaporte, RUC).
- **Datos de Contacto:** Dirección fiscal/comercial, correo electrónico, número de teléfono o WhatsApp.
- **Datos Transaccionales:** Historial de compras, comprobantes emitidos, métodos de pago utilizados y saldos de crédito.

### 3.2 Finalidades del Tratamiento
Los datos personales son tratados para las siguientes finalidades explícitas y legítimas:
- **Prestación del Servicio SaaS:** Procesar ventas, emitir comprobantes tributarios ante SUNAT, actualizar inventarios y administrar cuentas de usuario.
- **Mensajería Operativa:** Envío de representaciones impresas/digitales de recibos de venta vía correo electrónico o WhatsApp a solicitud del comprador.
- **Soporte Técnico y Garantía:** Atender consultas, incidentes operativos y solicitudes de asistencia.
- **Comunicaciones Comerciales (con Opt-In explícito):** Envío de información sobre actualizaciones del sistema o promociones, sujeto al consentimiento previo del titular.

---

## 4. Consentimiento Explícito por Propósito

KipusPay aplica el principio de consentimiento informado y diferenciado:

```text
[Formulario / Punto de Venta]
     │
     ├──► Finalidad 1: Emisión Fiscal y Recibo Digital ──► Obligatorio para ejecutar la compra
     │
     └──► Finalidad 2: Avisos Comerciales y Promociones ─► Opcional (Opt-In independiente)
```

El consentimiento para comunicaciones comerciales es totalmente voluntario y revocable en cualquier momento sin condicionar la prestación de los servicios de venta o facturación.

---

## 5. Derechos ARCO y Procedimiento para su Ejercicio

Los titulares de datos personales tienen derecho a ejercer sus derechos de **Acceso, Rectificación, Cancelación y Oposición (ARCO)** garantizados por la Ley N.º 29733:

- **Acceso:** Solicitar y obtener información sobre sus datos personales incluidos en nuestros bancos de datos.
- **Rectificación:** Modificar los datos que resulten inexactos, erróneos o incompletos.
- **Cancelación (Borrado):** Solicitar la supresión de sus datos personales cuando hayan dejado de ser necesarios para la finalidad recopilada.
- **Oposición:** Oponerse al tratamiento de sus datos para finalidades específicas (ej. mercadotecnia).

Para ejercer sus derechos ARCO, el titular o su representante legal puede enviar una solicitud dirigida a nuestro Oficial de Protección de Datos (DPO) a través del canal oficial: **`privacidad@kipuspay.com`**. La solicitud se responderá dentro de los plazos legales establecidos por el Reglamento de la Ley N.º 29733.

---

## 6. Armonización entre Privacidad (LPDP) y Retención Fiscal Obligatoria (SUNAT)

Existe un mandato legal concurrente entre la normativa de privacidad y la normativa tributaria en Perú:

### 6.1 Conflicto Normativo Resuelto
- **Ley Tributaria (SUNAT):** Exige a los contribuyentes conservar los comprobantes de pago emitidos (Boletas, Facturas, Notas de Crédito) por un período mínimo de **5 años**.
- **Ley de Privacidad (LPDP):** Concede al titular el derecho a solicitar la cancelación o borrado de sus datos personales.

### 6.2 Procedimiento Técnico-Legal de Anonimización
Ante una solicitud de borrado de datos formulada por un comprador final, KipusPay aplica el estándar de **Anonimización Inalterable**:

```text
[Solicitud de Cancelación LPDP]
           │
           ├──► Base de Datos de Clientes / Marketing ──► BORRADO TOTAL de registros identificables
           │
           └──► Registro Histórico de Comprobantes ────► ANONIMIZACIÓN: Nombres y Direcciones reemplazados
                                                         por la leyenda "[ANONYMIZED]".
                                                         Se conserva el RUC/DNI y monto exigido por SUNAT.
```

De esta forma, se satisface plenamente la eliminación de los datos personales identificables del titular sin vulnerar la obligación legal de conservación fiscal de los libros electrónicos ante SUNAT.

---

## 7. Medidas de Seguridad de la Información

KipusPay adopta medidas de seguridad organizativas, jurídicas y técnicas de nivel bancario para evitar la alteración, pérdida, tratamiento o acceso no autorizado a los datos personales:
- Cifrado de datos en tránsito (TLS 1.3) y datos en reposo (AES-256).
- Controles de acceso basados en roles con autenticación segura.
- Aislamiento estricto de datos entre empresas clientes (arquitectura multitenant segregada).
- Registro inalterable de auditoría para operaciones sobre datos sensibles.

---

## 8. Modificaciones a la Política de Privacidad

KipusPay se reserva el derecho de actualizar esta Política de Privacidad para adecuarla a cambios legislativos o mejoras operativas. Las modificaciones serán notificadas a través del portal web `https://kipuspay.com` y surtirán efecto desde su publicación oficial.

---
