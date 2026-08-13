/**
 * Adaptador de mensajería — email + WhatsApp Business (§5.4 regla 5).
 */
import {
  assertSendableQuote,
  assertSendableReceipt,
  QUOTE_TEMPLATE_ID,
  receiptTemplateId,
  type MessagingSenderPort,
  type MessagingSendQuoteRequest,
  type MessagingSendQuoteResult,
  type MessagingSendReceiptRequest,
  type MessagingSendReceiptResult,
} from '@kipuspay/domain-integrations';

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly htmlBody: string;
}

export interface NotificationResult {
  readonly messageId: string;
  readonly delivered: boolean;
}

export function normalizeRecipient(to: string): string {
  return to.trim().toLowerCase();
}

export function isPlausibleEmail(to: string): boolean {
  return normalizeRecipient(to).includes('@');
}

export interface WhatsAppSenderEnv {
  readonly WA_ACCESS_TOKEN?: string;
  readonly WA_PHONE_NUMBER_ID?: string;
  readonly WA_API_BASE?: string;
}

/** Sandbox determinista: acepta sin HTTP cuando no hay token. */
export function createWhatsAppMessagingSender(
  env: WhatsAppSenderEnv = {},
  fetchImpl: typeof fetch = fetch,
): MessagingSenderPort {
  return {
    async sendReceipt(request: MessagingSendReceiptRequest): Promise<MessagingSendReceiptResult> {
      assertSendableReceipt(request);
      const templateId = receiptTemplateId(request.documentKind);
      const token = env.WA_ACCESS_TOKEN?.trim();
      const phoneId = env.WA_PHONE_NUMBER_ID?.trim();
      if (!token || !phoneId) {
        // S43-H1: fail-closed — sin token NUNCA se afirma entrega (un ACK
        // falso marcaría SENT sin entrega externa real).
        return {
          accepted: false,
          providerRef: null,
          templateId,
        };
      }
      const base = (env.WA_API_BASE ?? 'https://graph.facebook.com/v19.0').replace(/\/$/, '');
      const res = await fetchImpl(`${base}/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: request.phoneE164.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: templateId,
            language: { code: 'es' },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: request.representationUrl }],
              },
            ],
          },
        }),
      });
      if (!res.ok) {
        return { accepted: false, providerRef: null, templateId };
      }
      const json = (await res.json()) as { messages?: Array<{ id?: string }> };
      return {
        accepted: true,
        providerRef: json.messages?.[0]?.id ?? null,
        templateId,
      };
    },
    async sendQuote(request: MessagingSendQuoteRequest): Promise<MessagingSendQuoteResult> {
      assertSendableQuote(request);
      const templateId = QUOTE_TEMPLATE_ID;
      const token = env.WA_ACCESS_TOKEN?.trim();
      const phoneId = env.WA_PHONE_NUMBER_ID?.trim();
      if (!token || !phoneId) {
        return {
          accepted: false,
          providerRef: null,
          templateId,
        };
      }
      const base = (env.WA_API_BASE ?? 'https://graph.facebook.com/v19.0').replace(/\/$/, '');
      const res = await fetchImpl(`${base}/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: request.phoneE164.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: templateId,
            language: { code: 'es' },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: request.representationUrl }],
              },
            ],
          },
        }),
      });
      if (!res.ok) {
        return { accepted: false, providerRef: null, templateId };
      }
      const json = (await res.json()) as { messages?: Array<{ id?: string }> };
      return {
        accepted: true,
        providerRef: json.messages?.[0]?.id ?? null,
        templateId,
      };
    },
  };
}
