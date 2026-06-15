import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { AuthUser, LoginResponse } from '@dealer/shared';
import { pool } from '../db/pool.js';
import { signToken } from '../auth/jwt.js';
import { authenticate } from '../auth/guards.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'email and password required' });
    const { email, password } = parsed.data;

    const r = await pool.query(
      `SELECT user_id, email, password_hash, role, tenant_id, location_id, entitlements, active
         FROM app_user WHERE email = $1`,
      [email],
    );
    const row = r.rows[0];
    if (!row || !row.active) return reply.code(401).send({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return reply.code(401).send({ error: 'Invalid credentials' });

    const user: AuthUser = {
      user_id: row.user_id,
      email: row.email,
      role: row.role,
      tenant_id: row.tenant_id,
      entitlements: row.entitlements ?? [],
      location_id: row.location_id,
    };
    const body: LoginResponse = { token: signToken(user), user };
    return body;
  });

  app.get('/api/auth/me', { preHandler: authenticate }, async (req) => {
    return req.user;
  });
}
