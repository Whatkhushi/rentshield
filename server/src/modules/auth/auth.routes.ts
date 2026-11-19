import { Router, type CookieOptions, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { User } from '@prisma/client';
import { prisma } from '../../db.js';
import { isProd } from '../../config.js';
import { ApiError } from '../../lib/errors.js';
import { newOpaqueToken, REFRESH_TOKEN_DAYS, sha256, signAccessToken } from '../../lib/tokens.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const authRouter = Router();

const REFRESH_COOKIE = 'rs_refresh';
const cookieOptions: CookieOptions = {
  httpOnly: true, // not readable from JavaScript -> safe from XSS theft
  secure: isProd, // HTTPS only in production
  sameSite: 'strict', // not sent on cross-site requests -> CSRF protection
  path: '/api/v1/auth',
  maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
};

export const publicUser = (u: Pick<User, 'id' | 'name' | 'email'>) => ({ id: u.id, name: u.name, email: u.email });

async function issueSession(res: Response, user: User) {
  const { token, hash } = newOpaqueToken();
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 86_400_000) },
  });
  res.cookie(REFRESH_COOKIE, token, cookieOptions);
  return { accessToken: signAccessToken({ sub: user.id, name: user.name }), user: publicUser(user) };
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
});

authRouter.post('/register', validate({ body: registerSchema }), async (_req, res) => {
  const { name, email, password } = res.locals.body as z.infer<typeof registerSchema>;
  if (await prisma.user.findUnique({ where: { email } })) {
    throw ApiError.conflict('EMAIL_TAKEN', 'An account with this email already exists');
  }
  const user = await prisma.user.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 10) } });
  res.status(201).json(await issueSession(res, user));
});

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

authRouter.post('/login', validate({ body: loginSchema }), async (_req, res) => {
  const { email, password } = res.locals.body as z.infer<typeof loginSchema>;
  const user = await prisma.user.findUnique({ where: { email } });
  // Same message for unknown email and wrong password: don't reveal which emails exist.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  res.json(await issueSession(res, user));
});

/** Rotation + reuse detection: a revoked token being replayed revokes every session. */
authRouter.post('/refresh', async (req, res) => {
  const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('No session');
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  const clear = () => res.clearCookie(REFRESH_COOKIE, { path: cookieOptions.path });

  if (!stored || stored.expiresAt < new Date()) {
    clear();
    throw ApiError.unauthorized('Session expired, please log in again');
  }
  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    clear();
    throw ApiError.unauthorized('Session was revoked, please log in again');
  }
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  res.json(await issueSession(res, stored.user));
});

authRouter.post('/logout', async (req, res) => {
  const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  res.clearCookie(REFRESH_COOKIE, { path: cookieOptions.path });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) throw ApiError.unauthorized();
  res.json({ user: publicUser(user) });
});
