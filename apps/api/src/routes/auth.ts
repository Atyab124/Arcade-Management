import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
import { getPrisma } from '@arcade/db';
import { LoginSchema, RefreshSchema, type AccessTokenPayload } from '@arcade/types';
import { Unauthorized } from '../errors.js';
import { getConfig } from '../config.js';

export const authRouter = Router();

function signAccessToken(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): string {
  const cfg = getConfig();
  return jwt.sign(payload, cfg.JWT_ACCESS_SECRET, { expiresIn: cfg.JWT_ACCESS_TTL_SECONDS });
}

function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);
    const prisma = getPrisma();
    // Cross-tenant login: we use the email's unique constraint scoped per tenant, so we
    // need to find any user record with that email. In single-tenant pilot, email is
    // effectively globally unique; once multi-tenant, login UX would include tenant slug.
    const user = await prisma.user.findFirst({
      where: { email, active: true },
    });
    if (!user) throw Unauthorized('invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw Unauthorized('invalid credentials');

    const accessToken = signAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as AccessTokenPayload['role'],
      email: user.email,
    });
    const refresh = generateRefreshToken();
    const cfg = getConfig();
    await prisma.refreshToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        tokenHash: refresh.hash,
        expiresAt: new Date(Date.now() + cfg.JWT_REFRESH_TTL_SECONDS * 1000),
      },
    });

    res.json({
      accessToken,
      refreshToken: refresh.token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = RefreshSchema.parse(req.body);
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const prisma = getPrisma();
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw Unauthorized('invalid refresh token');
    }
    const user = await prisma.user.findFirst({
      where: { tenantId: row.tenantId, id: row.userId, active: true },
    });
    if (!user) throw Unauthorized('user not found or inactive');

    const accessToken = signAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as AccessTokenPayload['role'],
      email: user.email,
    });
    res.json({ accessToken });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = RefreshSchema.parse(req.body);
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const prisma = getPrisma();
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
