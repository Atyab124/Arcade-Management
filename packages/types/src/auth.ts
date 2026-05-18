import { z } from 'zod';
import { UserRole } from './enums.js';

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const RefreshSchema = z.object({
  refreshToken: z.string().min(20),
});
export type RefreshInput = z.infer<typeof RefreshSchema>;

export const UserCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(100),
  phone: z.string().max(40).optional(),
  role: z.enum([UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF]).default(UserRole.STAFF),
});
export type UserCreateInput = z.infer<typeof UserCreateSchema>;

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
}

export interface AccessTokenPayload extends AuthContext {
  iat: number;
  exp: number;
}
