import { z } from 'zod';

export const userSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const authenticationResponseSchema = z.strictObject({
  token: z.string().min(1),
  user: userSchema,
});

export const currentUserResponseSchema = z.strictObject({
  user: userSchema,
});

export type User = z.infer<typeof userSchema>;
export type AuthenticationResponse = z.infer<typeof authenticationResponseSchema>;

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}
