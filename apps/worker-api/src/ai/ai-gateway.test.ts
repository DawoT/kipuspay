import { describe, expect, it, vi } from 'vitest';
import { createWorkersAiGateway, type AiGatewayDependencies } from './ai-gateway.js';

function mockAiBinding(): AiGatewayDependencies['binding'] {
  const ai = {
    run: vi.fn((_model: string, input: { messages: unknown[] }) => {
      void input;
      return Promise.resolve({ response: 'deterministic' });
    }),
  };
  return ai;
}

describe('insights AiGateway (Sprint 49)', () => {
  it('implementa las tres operaciones del port', () => {
    const gateway = createWorkersAiGateway({
      binding: mockAiBinding(),
      model: 'test-model',
    });
    expect(typeof gateway.routerIntent).toBe('function');
    expect(typeof gateway.translateToSql).toBe('function');
    expect(typeof gateway.generateText).toBe('function');
  });

  it('generateText enruta al binding con el modelo configurado', async () => {
    const binding = mockAiBinding();
    const gateway = createWorkersAiGateway({ binding, model: 'm-1' });
    const text = await gateway.generateText('Pregunta', ['facto']);
    expect(text).toBe('deterministic');
    expect((binding.run as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe('m-1');
  });
});
