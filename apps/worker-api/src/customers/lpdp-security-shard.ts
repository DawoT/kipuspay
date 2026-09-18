import { DurableObject } from 'cloudflare:workers';
import type { WorkerEnv } from '../auth/control-plane';

export interface LpdpRateLimitInput {
  readonly keyHash: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly nowMs: number;
}

export interface LpdpRateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export interface LpdpOtpChallengeInput {
  readonly challengeId: string;
  readonly tenantId: string;
  readonly customerId: string;
  readonly codeHash: string;
  readonly expiresAtMs: number;
}

export type LpdpOtpConsumeResult =
  | { readonly kind: 'VERIFIED'; readonly tenantId: string; readonly customerId: string }
  | { readonly kind: 'INVALID' };

export class LpdpSecurityShard extends DurableObject<WorkerEnv> {
  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS lpdp_rate_buckets (
          key_hash TEXT PRIMARY KEY,
          count INTEGER NOT NULL CHECK (count >= 0),
          window_started_at_ms INTEGER NOT NULL,
          expires_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_lpdp_rate_buckets_expiry
          ON lpdp_rate_buckets (expires_at_ms);
        CREATE TABLE IF NOT EXISTS lpdp_otp_challenges (
          challenge_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
          expires_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_lpdp_otp_challenges_expiry
          ON lpdp_otp_challenges (expires_at_ms);
      `);
  }

  async consumeRateLimit(input: LpdpRateLimitInput): Promise<LpdpRateLimitResult> {
    const windowStartedAtMs = input.nowMs;
    const expiresAtMs = input.nowMs + input.windowMs;
    const row = this.ctx.storage.sql
      .exec<{ count: number; window_started_at_ms: number }>(
        `INSERT INTO lpdp_rate_buckets (
           key_hash, count, window_started_at_ms, expires_at_ms
         ) VALUES (?, 1, ?, ?)
         ON CONFLICT (key_hash) DO UPDATE SET
           count = CASE
             WHEN lpdp_rate_buckets.window_started_at_ms + ? <= ? THEN 1
             ELSE lpdp_rate_buckets.count + 1
           END,
           window_started_at_ms = CASE
             WHEN lpdp_rate_buckets.window_started_at_ms + ? <= ? THEN excluded.window_started_at_ms
             ELSE lpdp_rate_buckets.window_started_at_ms
           END,
           expires_at_ms = CASE
             WHEN lpdp_rate_buckets.window_started_at_ms + ? <= ? THEN excluded.expires_at_ms
             ELSE lpdp_rate_buckets.expires_at_ms
           END
         RETURNING count, window_started_at_ms`,
        input.keyHash,
        windowStartedAtMs,
        expiresAtMs,
        input.windowMs,
        input.nowMs,
        input.windowMs,
        input.nowMs,
        input.windowMs,
        input.nowMs,
      )
      .one();
    const allowed = row.count <= input.limit;
    await this.ctx.storage.setAlarm(Date.now() + 60_000);
    return {
      allowed,
      remaining: Math.max(0, input.limit - row.count),
      retryAfterSeconds: Math.max(
        0,
        Math.ceil((row.window_started_at_ms + input.windowMs - input.nowMs) / 1000),
      ),
    };
  }

  async createOtpChallenge(input: LpdpOtpChallengeInput): Promise<void> {
    this.ctx.storage.sql.exec(
      `INSERT INTO lpdp_otp_challenges (
         challenge_id, tenant_id, customer_id, code_hash, expires_at_ms
       ) VALUES (?, ?, ?, ?, ?)`,
      input.challengeId,
      input.tenantId,
      input.customerId,
      input.codeHash,
      input.expiresAtMs,
    );
    await this.ctx.storage.setAlarm(Date.now() + 60_000);
  }

  consumeOtpChallenge(input: {
    readonly challengeId: string;
    readonly codeHash: string;
    readonly nowMs: number;
    readonly maxAttempts: number;
  }): LpdpOtpConsumeResult {
    const row = this.ctx.storage.sql
      .exec<{
        tenant_id: string;
        customer_id: string;
        code_hash: string;
        attempts: number;
        expires_at_ms: number;
      }>(
        `SELECT tenant_id, customer_id, code_hash, attempts, expires_at_ms
         FROM lpdp_otp_challenges WHERE challenge_id = ?`,
        input.challengeId,
      )
      .toArray()[0];
    if (!row) return { kind: 'INVALID' };
    if (row.expires_at_ms <= input.nowMs || row.attempts >= input.maxAttempts) {
      this.ctx.storage.sql.exec(
        'DELETE FROM lpdp_otp_challenges WHERE challenge_id = ?',
        input.challengeId,
      );
      return { kind: 'INVALID' };
    }
    if (!constantTimeEqual(row.code_hash, input.codeHash)) {
      this.ctx.storage.sql.exec(
        `UPDATE lpdp_otp_challenges SET attempts = attempts + 1
         WHERE challenge_id = ? AND attempts < ? AND expires_at_ms > ?`,
        input.challengeId,
        input.maxAttempts,
        input.nowMs,
      );
      return { kind: 'INVALID' };
    }
    const consumed = this.ctx.storage.sql
      .exec<{ tenant_id: string; customer_id: string }>(
        `DELETE FROM lpdp_otp_challenges
         WHERE challenge_id = ? AND code_hash = ? AND attempts < ? AND expires_at_ms > ?
         RETURNING tenant_id, customer_id`,
        input.challengeId,
        input.codeHash,
        input.maxAttempts,
        input.nowMs,
      )
      .toArray()[0];
    return consumed
      ? { kind: 'VERIFIED', tenantId: consumed.tenant_id, customerId: consumed.customer_id }
      : { kind: 'INVALID' };
  }

  deleteOtpChallenge(challengeId: string): void {
    this.ctx.storage.sql.exec(
      'DELETE FROM lpdp_otp_challenges WHERE challenge_id = ?',
      challengeId,
    );
  }

  override async alarm(): Promise<void> {
    const nowMs = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM lpdp_rate_buckets WHERE expires_at_ms <= ?', nowMs);
    this.ctx.storage.sql.exec('DELETE FROM lpdp_otp_challenges WHERE expires_at_ms <= ?', nowMs);
    await this.ctx.storage.setAlarm(nowMs + 60_000);
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
