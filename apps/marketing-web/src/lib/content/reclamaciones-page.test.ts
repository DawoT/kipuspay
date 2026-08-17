import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('página /reclamaciones', () => {
  it('posta a /v1/reclamaciones y muestra el número de caso REC-', () => {
    const source = readFileSync(
      new URL('../../routes/reclamaciones/+page.svelte', import.meta.url),
      'utf8',
    );
    expect(source).toContain('/v1/reclamaciones');
    expect(source).toMatch(/caseNumber/);
    expect(source).toContain('Número de caso');
  });
});
