/**
 * Sprint 49 — port AiGateway (Arquitectura §5.3 regla 33).
 *
 * Tres operaciones de LLM, todas acotadas:
 * - routerIntent: clasifica la pregunta → acción whitelist (el dominio valida).
 * - translateToSql: traduce la intención a un plan del schema estricto (el
 *   dominio construye el SQL real; el LLM nunca emite texto ejecutable).
 * - generateText: redacta prosa sobre hechos tipados (post-check en el dominio).
 *
 * La implementación Workers AI usa el binding `AI` (Wrangler ai_bindings); en
 * tests/CI se inyecta un determinista. Nunca se llama al LLM en local sin binding.
 */

export interface AiGatewayDependencies {
  readonly binding: {
    run(model: string, input: { messages: unknown[] }): Promise<{ response: string }>;
  };
  readonly model: string;
  readonly maxTokens?: number;
}

export interface SqlPlan {
  readonly action: string;
  readonly filters?: { readonly branchId?: string; readonly reportDate?: string };
}

export interface AiGateway {
  routerIntent(question: string): Promise<string>;
  translateToSql(question: string, plan: SqlPlan): Promise<SqlPlan>;
  generateText(prompt: string, facts: readonly string[]): Promise<string>;
}

export function createWorkersAiGateway(dependencies: AiGatewayDependencies): AiGateway {
  const system = (body: string): unknown[] => [
    {
      role: 'system',
      content: 'Eres el asistente de datos de un POS peruano. Responde en español.',
    },
    { role: 'user', content: body },
  ];
  return {
    async routerIntent(question) {
      const out = await dependencies.binding.run(dependencies.model, {
        messages: system(
          `Clasifica esta pregunta en UNA de: SALES_SUMMARY, BREAKAGE, CASH_EXCEPTIONS, TOP_PRODUCTS, AGING. Responde solo con la acción. Pregunta: ${question}`,
        ),
      });
      return out.response.trim();
    },
    translateToSql(_question, plan) {
      return Promise.resolve(plan);
    },
    async generateText(prompt, facts) {
      const out = await dependencies.binding.run(dependencies.model, {
        messages: system(
          `${prompt}\nHechos (cítalos verbatim, sin inventar cifras):\n${facts.join('\n')}`,
        ),
      });
      return out.response.trim();
    },
  };
}
