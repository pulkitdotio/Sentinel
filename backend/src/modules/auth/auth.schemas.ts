import { z } from 'zod';

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const normalizedEmailSchema = z
  .string()
  .transform(normalizeEmail)
  .pipe(z.email().max(MAX_EMAIL_LENGTH));

export const registerBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  email: normalizedEmailSchema,
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

export const loginBodySchema = z.strictObject({
  email: normalizedEmailSchema,
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

export type RegisterInput = z.infer<typeof registerBodySchema>;
export type LoginInput = z.infer<typeof loginBodySchema>;
