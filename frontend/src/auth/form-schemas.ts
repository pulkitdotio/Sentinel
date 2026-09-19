import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address')
  .max(254, 'Email must be 254 characters or fewer')
  .email('Enter a valid email address');

export const loginFormSchema = z.strictObject({
  email: emailSchema,
  password: z
    .string()
    .min(1, 'Enter your password')
    .max(128, 'Password must be 128 characters or fewer'),
});

export const registerFormSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, 'Enter your name')
    .max(100, 'Name must be 100 characters or fewer'),
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be 128 characters or fewer'),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
export type RegisterFormValues = z.infer<typeof registerFormSchema>;
