import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthUser } from '@dealer/shared';
import { verifyToken } from './jwt.js';
import { hasCapability, type Capability } from './capabilities.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/** Authenticate every request (spec Section 5 — no anonymous access). */
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Authentication required' });
  }
  try {
    req.user = verifyToken(header.slice('Bearer '.length));
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }
}

/** Gate a route on a capability (server-side RBAC). */
export function requireCapability(cap: Capability) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: 'Authentication required' });
    if (!hasCapability(req.user.role, cap)) {
      return reply.code(403).send({ error: `Missing capability: ${cap}` });
    }
  };
}

/**
 * Non-bypassable tenant scoping (spec FR-1): does this user's entitlements
 * cover the target tenant?
 */
export function canAccessTenant(user: AuthUser, tenantId: string): boolean {
  switch (user.role) {
    case 'admin':
    case 'ams_power_user':
      return true; // cross-tenant
    case 'consultant':
    case 'service_provider':
      return user.entitlements.includes(tenantId);
    case 'oem_office':
    case 'dealer':
      return user.tenant_id === tenantId;
    default:
      return false;
  }
}

/** Assert tenant access or throw a 403 via reply. Returns true when allowed. */
export function assertTenant(user: AuthUser, tenantId: string, reply: FastifyReply): boolean {
  if (!canAccessTenant(user, tenantId)) {
    reply.code(403).send({ error: 'Not entitled to this tenant' });
    return false;
  }
  return true;
}
