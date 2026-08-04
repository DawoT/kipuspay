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
