import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_DAYS = 7;

export interface AccessPayload {
  sub: number;
  name: string;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET) as unknown as AccessPayload;
  return { sub: Number(decoded.sub), name: decoded.name };
}

/** Random opaque token (refresh tokens, invitation links). Only the hash is stored. */
export function newOpaqueToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}

export function sha256(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
