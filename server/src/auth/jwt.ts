import jwt from 'jsonwebtoken';
import type { AuthUser } from '@dealer/shared';
import { config } from '../config.js';

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: '12h' });
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, config.jwtSecret) as AuthUser;
}
