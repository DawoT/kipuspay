/**
 * Sprint 49 — cliente de insights (Arquitectura §5.3 regla 33).
 * Briefing (lectura KV <10ms, banner de antigüedad) y chat SSE determinista.
 * El tenant jamás viaja en el body: lo pone el backend desde el JWT.
 */
export interface BriefingDto {
  readonly reportDate: string;
  readonly briefing: string;
  readonly staleAt: string;
}

export interface ChatSseEvent {
  readonly text?: string;
  readonly cached?: boolean;
}

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface InsightsClientDependencies {
  readonly authenticatedFetch: FetchPort;
  readonly apiBase?: string;
}

export function createInsightsClient(dependencies: InsightsClientDependencies) {
  const base = (dependencies.apiBase ?? '').replace(/\/$/, '');

  async function briefing(date?: string): Promise<BriefingDto | null> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const response = await dependencies.authenticatedFetch(`${base}/api/insights/briefing${query}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('BRIEFING_UNAVAILABLE');
    return (await response.json()) as BriefingDto;
  }

  /** Chat SSE: lee el stream `data: {...}` hasta el cierre. */
  async function chat(question: string, idempotencyKey: string): Promise<string> {
    const response = await dependencies.authenticatedFetch(`${base}/api/insights/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, idempotencyKey }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { code?: string };
      throw new Error(body.code ?? `INSIGHTS_HTTP_${response.status}`);
    }
    const text = await response.text();
    const match = text.match(/data: (.+)/);
    if (!match?.[1]) throw new Error('INSIGHTS_SSE_INVALID');
    const event = JSON.parse(match[1]) as ChatSseEvent;
    return event.text ?? '';
  }

  return { briefing, chat };
}

export type InsightsClient = ReturnType<typeof createInsightsClient>;
