import { describe, expect, it, vi } from 'vitest';
import {
  buildReclamacionCaseNumber,
  parseReclamacionBody,
  runCreateReclamacionHttp,
  runListReclamacionesHttp,
  runRespondReclamacionHttp,
} from './reclamaciones-routes.js';

describe('libro de reclamaciones (Ley 29571)', () => {
  it('emite número de caso REC-YYYYMMDD-XXXX', () => {
    expect(buildReclamacionCaseNumber(new Date('2026-08-14T12:00:00Z'), 'ab12cd')).toBe(
      'REC-20260814-AB12CD',
    );
  });

  it('rechaza body incompleto o tipo inválido', () => {
    expect(parseReclamacionBody(null)).toMatchObject({ code: 'BAD_REQUEST' });
    expect(
      parseReclamacionBody({
        claimantName: 'Ana',
        documentType: 'XX',
        documentNumber: '1',
        email: 'a@b.c',
        claimKind: 'reclamo',
        detail: 'x',
      }),
    ).toMatchObject({ code: 'INVALID_DOCUMENT' });
  });

  it('persiste y devuelve acuse 201', async () => {
    const run = vi.fn(() => Promise.resolve({ success: true }));
    const env = {
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ run })),
        })),
      },
    };
    const res = await runCreateReclamacionHttp(
      env as never,
      {
        claimantName: 'Ana Pérez',
        documentType: 'DNI',
        documentNumber: '12345678',
        email: 'ana@example.com',
        claimKind: 'reclamo',
        detail: 'No reconocí un cargo.',
      },
      new Date('2026-08-14T12:00:00Z'),
    );
    expect(res.status).toBe(201);
    expect(String(res.body.caseNumber)).toMatch(/^REC-20260814-[A-Z0-9]+$/);
    expect(run).toHaveBeenCalled();
  });

  it('sin DB → 503', async () => {
    const res = await runCreateReclamacionHttp(undefined, {
      claimantName: 'Ana Pérez',
      documentType: 'DNI',
      documentNumber: '12345678',
      email: 'ana@example.com',
      claimKind: 'queja',
      detail: 'Demora.',
    });
    expect(res.status).toBe(503);
  });

  it('bandeja staff: token inválido → 401; token ok lista y responde', async () => {
    const all = vi.fn(() => Promise.resolve({ results: [{ id: 'r1', case_number: 'REC-1', status: 'open' }] }));
    const run = vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } }));
    const env = {
      PLATFORM_STAFF_TOKEN: 'staff-secret',
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ run })),
          all,
        })),
      },
    };
    expect((await runListReclamacionesHttp(env as never, 'nope')).status).toBe(401);
    const list = await runListReclamacionesHttp(env as never, 'staff-secret');
    expect(list.status).toBe(200);
    expect((list.body.items as unknown[]).length).toBe(1);
    const respond = await runRespondReclamacionHttp(env as never, 'staff-secret', {
      id: 'r1',
      responseText: 'Atendido.',
    });
    expect(respond.status).toBe(200);
    expect(respond.body.status).toBe('responded');
  });
});
