import { describe, expect, it } from 'vitest';
import down0044 from '../migrations-down/0044_sprint52_onboarding_tour.sql?raw';
import migration0044 from '../migrations/0044_sprint52_onboarding_tour.sql?raw';
import { D1_BACKUP_TABLES } from './data-backup-registry.generated.js';
import { DOWN_0044_SPRINT52_ONBOARDING_TOUR } from './migrations-down.js';

describe('Sprint 52 onboarding tour schema', () => {
  it('recrea growth_events con el catálogo de eventos extendido (tour + checklist)', () => {
    expect(migration0044).toContain('tour_started');
    expect(migration0044).toContain('tour_completed');
    expect(migration0044).toContain('tour_dismissed');
    expect(migration0044).toContain('setup_checklist_step_completed');
    expect(migration0044).toContain('setup_checklist_completed');
    expect(migration0044).toContain('INSERT INTO growth_events');
    expect(migration0044).toContain('SELECT id, tenant_id, event_type, occurred_at, meta_json');
  });

  it('conserva los 6 eventos históricos del catálogo (append-only de catálogo)', () => {
    for (const historic of [
      'onboarding_started',
      'first_sale',
      'formalization_upgrade',
      'trial_to_paid',
      'plan_upgrade',
      'referral_credited',
    ]) {
      expect(migration0044).toContain(historic);
    }
  });

  it('growth_events permanece EPHEMERAL (no afecta backups)', () => {
    const registry = new Map(D1_BACKUP_TABLES.map((entry) => [entry.name, entry]));
    expect(registry.get('growth_events')?.classification).toBe('EPHEMERAL');
  });

  it('down espejo: recrea el catálogo original con guard contra eventos nuevos', () => {
    expect(DOWN_0044_SPRINT52_ONBOARDING_TOUR).toBe(down0044);
    expect(down0044).toContain('ONBOARDING_DOWN_PROTECTED');
    expect(down0044).toContain('setup_checklist_completed');
    expect(down0044).toContain('DROP TABLE growth_events');
  });
});
