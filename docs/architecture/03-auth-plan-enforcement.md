---
doc_id: arch-03-auth-plan-enforcement
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "3"
---

## **3. Autenticación Integrada (IdP Sync) & SaaS Plan Enforcement Middleware**

// src/middleware/tenantAndAuthRouter.ts  
import { createMiddleware } from 'hono/factory';  
import { Context } from 'hono';

export interface UserSession {  
  userId: string;  
  tenantId: string;  
  branchId: string;  
  allowedBranches: string[];  
  // Roles de caja (producto, GTM §3.3.1). kds NO es rol core: es capability
  // `orders.kds.operate` (Interface Segregation, ADR-ARCH-002) — no vertical_type
  // en el núcleo (regla §1.1).
  role: 'owner' | 'admin' | 'supervisor' | 'cashier';  
  permissions: string[];  
}

export interface TenantContext {  
  id: string;  
  ruc: string;  
  shardId: string;  
  // Planes de producto (GTM §4.1): arranque|crece|cadena|enterprise — el enum
  // del middleware y el gating de capabilities/reportes usan estos 4 valores.
  planId: 'arranque' | 'crece' | 'cadena' | 'enterprise';  
  subscriptionStatus: 'trial' | 'active' | 'past_due' | 'canceled';  
  trialEndsAt: string | null;  
  vertical: 'restaurant' | 'pharmacy' | 'hardware' | 'retail' | 'service';  
  status: 'active' | 'suspended';  
}

export const tenantAndAuthMiddleware = () => {  
  return createMiddleware(async (c: Context, next) => {  
    const host = c.req.header('host') || '';  
    // SEC-01: identidad SOLO desde el JWT verificado. El middleware exige
    // `Authorization: Bearer <JWT>` y verifica firma (WebCrypto), exp/iat/nbf y
    // denylist de alg (`none`, HS si hay JWKS). `tenantId` y `externalAuthId` se
    // derivan ÚNICAMENTE de los claims verificados.
    // `x-tenant-id` se usa solo como HINT de shard y DEBE coincidir con el claim
    // (mismatch → 403). `x-external-auth-id` deja de ser fuente de identidad.
    const authz = c.req.header('authorization') || '';  
    const jwtClaims = authz.startsWith('Bearer ')  
      ? await verifyJwt(c.env, authz.slice(7))   // throws JWT_INVALID | JWT_EXPIRED | JWT_ALG_NONE
      : null;  
    if (!jwtClaims) {  
      return c.json({ error: 'Missing or invalid Bearer JWT', code: 'UNAUTHENTICATED' }, 401);  
    }  
    const tenantId = jwtClaims.tenantId;  
    const externalAuthId = jwtClaims.sub || jwtClaims.externalAuthId;  
    const hintTenantId = c.req.header('x-tenant-id') || host.split('.')[0];  
    if (hintTenantId && hintTenantId !== tenantId) {  
      return c.json({ error: 'Tenant hint mismatch with verified JWT', code: 'TENANT_HINT_MISMATCH' }, 403);  
    }

    // PERF-04: caché de 2 niveles (anti thundering herd, §8.1) en el AUTH path:
    // in-isolate (TTL 5-10s) → KV fallback → DO SOLO en cache-miss. El DO NUNCA se
    // consulta por request (contradice §8.1 "DO no se consulta en el hot path de lectura").
    let tenant: TenantContext | null;
    try {
      tenant = await getTenantCached(c.env, tenantId);
    } catch (err) {
      return c.json({ error: 'Tenant control plane unavailable', code: 'AUTH_CONTROL_UNAVAILABLE' }, 503);
    }
    if (!tenant) {  
      return c.json({ error: 'Tenant non-existent' }, 404);  
    }  
    try {
      if (await isTenantRevokedCached(c.env, tenantId)) {
        return c.json({ error: 'Tenant account suspended or revoked' }, 403);
      }
    } catch (err) {
      return c.json({ error: 'Tenant revocation control plane unavailable', code: 'REVOCATION_CHECK_UNAVAILABLE' }, 503);
    }

    if (tenant.status !== 'active') {  
      return c.json({ error: 'Tenant account inactive' }, 403);  
    }

    // 3. Evaluar vigencia de suscripción / Trial (SaaS Enforcement - Code 402)  
    // IMPORTANTE (GTM §4.1 / §4.3): 402 aplica SOLO a features premium.  
    // Rutas de cobro / caja / emisión de comprobantes NUNCA se bloquean por plan,  
    // volumen de boletas ni past_due dentro del periodo de gracia.  
    // En past_due post-gracia: degradar capabilities premium según plan
    // (modo_dueño, multi_caja, reportes_avanzados, api, insights — registro
    // canónico §1.1 / ADR-ARCH-002); mantener sale/checkout fail-open.  
    if (tenant.subscriptionStatus === 'trial' && tenant.trialEndsAt) {  
      const trialEnd = new Date(tenant.trialEndsAt).getTime();  
      if (Date.now() > trialEnd && isPremiumFeatureRoute(c.req.path)) {  
        return c.json({   
          error: 'Payment Required: Trial period expired. Please upgrade your plan.',  
          code: 'TRIAL_EXPIRED'  
        }, 402);  
      }  
    }

    if ((tenant.subscriptionStatus === 'past_due' || tenant.subscriptionStatus === 'canceled')  
        && isPremiumFeatureRoute(c.req.path)  
        && isPastGracePeriod(tenant)) {  
      return c.json({   
        error: 'Payment Required: Subscription past due or canceled.',  
        code: 'SUBSCRIPTION_INACTIVE'  
      }, 402);  
    }

    // 4. Inyectar binding dinámico de D1  
    const dbShard = c.env[tenant.shardId] as D1Database;  
    if (!dbShard) {  
      return c.json({ error: 'Database shard unmapped' }, 500);  
    }

    // 5. Autenticación y Carga de Permisos (IdP Sync -> D1)
    if (!externalAuthId) {
      return c.json({ error: 'JWT subject missing', code: 'UNAUTHENTICATED' }, 401);
    }
    if (externalAuthId) {  
      const userRecord = await dbShard.prepare(  
        `SELECT id, role, permissions, branch_id FROM users   
         WHERE external_auth_id = ? AND tenant_id = ? AND is_active = 1 AND deleted_at IS NULL`  
      ).bind(externalAuthId, tenant.id).first<{  
        id: string;  
        role: UserSession['role'];  
        permissions: string;  
        branch_id: string | null;  
      }>();

      if (!userRecord) {
        return c.json({ error: 'Local user is not active for this tenant', code: 'FORBIDDEN_USER' }, 403);
      }
      if (!userRecord.branch_id && ['cashier', 'supervisor'].includes(userRecord.role)) {
        return c.json({ error: 'Cash role requires a branch', code: 'FORBIDDEN_BRANCH' }, 403);
      }
      {  
        const userSession: UserSession = {  
          userId: userRecord.id,  
          tenantId: tenant.id,  
          branchId: userRecord.branch_id ?? '',  
          allowedBranches: userRecord.branch_id ? [userRecord.branch_id] : [],  
          role: userRecord.role,  
          permissions: JSON.parse(userRecord.permissions || '[]')  
        };  
        c.set('user', userSession);  
      }  
    }

    c.set('tenant', tenant);  
    c.set('db', dbShard);

    await next();  
  });  
};

// PERF-04: helpers de caché de 2 niveles del auth path (mismo patrón que el breaker §8.1).
// El mapa es por-isolate, TTL 10s y con límite de entradas para no retener tenants sin límite.
const isolateCache = new Map<string, { value: any; ts: number }>();  
const MAX_ISOLATE_CACHE_ENTRIES = 10_000;  

function putIsolateCache(key: string, value: any): void {  
  if (isolateCache.size >= MAX_ISOLATE_CACHE_ENTRIES && !isolateCache.has(key)) {  
    const oldest = isolateCache.keys().next().value as string | undefined;  
    if (oldest) isolateCache.delete(oldest);  
  }  
  isolateCache.set(key, { value, ts: Date.now() });  
}

function mapTenantRow(raw: any): TenantContext {
  return {
    id: raw.id,
    ruc: raw.ruc,
    shardId: raw.shardId ?? raw.shard_id,
    planId: raw.planId ?? raw.plan_id,
    subscriptionStatus: raw.subscriptionStatus ?? raw.subscription_status,
    trialEndsAt: raw.trialEndsAt ?? raw.trial_ends_at ?? null,
    vertical: raw.vertical ?? raw.vertical_type,
    status: raw.status ?? (raw.is_active ? 'active' : 'suspended')
  } as TenantContext;
}

async function getTenantCached(env: any, tenantId: string): Promise<TenantContext | null> {  
  const cached = isolateCache.get(`tenant:${tenantId}`);  
  if (cached && Date.now() - cached.ts < 10_000) return cached.value;  
  try {  
    const raw = await env.TENANT_KV.get(`tenant:${tenantId}`);  
    if (!raw) return null;  
    const parsed = mapTenantRow(JSON.parse(raw));  
    putIsolateCache(`tenant:${tenantId}`, parsed);  
    return parsed;  
  } catch (err) {  
    throw new Error('TENANT_CACHE_UNAVAILABLE');  
  }  
}

async function isTenantRevokedCached(env: any, tenantId: string): Promise<boolean> {  
  const cached = isolateCache.get(`revoked:${tenantId}`);  
  if (cached && Date.now() - cached.ts < 10_000) return cached.value;  

  // KV solo puede acelerar una revocación positiva; un `0` no puede ocultar el estado
  // autoritativo del DO y nunca se persiste como permiso indefinido.
  let kvFlag: string | null = null;  
  try {  
    kvFlag = await env.TENANT_KV.get(`revocation:${tenantId}`);  
  } catch (err) {  
    // Continúa al DO; no convierte una caída de KV en un falso `revoked=false` cacheado.
  }  
  if (kvFlag === '1') {  
    putIsolateCache(`revoked:${tenantId}`, true);  
    return true;  
  }  

  try {  
    const id = env.TENANT_STATE_DO.idFromName(tenantId);  
    const stub = env.TENANT_STATE_DO.get(id);  
    const res = await stub.fetch(new URL('/status', env.FQDN));  
    if (!res.ok) throw new Error(`DO responded with status ${res.status}`);  
    const data = await res.json() as { revoked: boolean };  
    const revoked = data.revoked === true;  
    putIsolateCache(`revoked:${tenantId}`, revoked);  
    return revoked;  
  } catch (err) {  
    // Fail-closed explícito: no autorizar cuando no puede comprobarse revocación.
    throw new Error('REVOCATION_CHECK_UNAVAILABLE');  
  }  
}

// SEC-03 — Gestión de secretos (política):
//   password_hash, pin_hash, transfer_pin_hash → argon2id (m=64MiB, t=3, p=1).
//   api_keys.key_hash → HMAC-SHA256 con salt aleatorio por key (+ pepper).
//   webhook_endpoints.secret_hash → SHA-256 con salt.
//   PIN de caja verificado server-side con lockout 5 fallos/15 min (SEC-11).
//   Clave privada del .pfx SUNAT: SOLO en Workers Secrets / envoltura KMS
//   (tabla tenant_certificates.private_key_kms_ref); jamás en D1/KV/R2. Rotación ≥ 2 años
//   y en caso de compromiso (SEC-03).

