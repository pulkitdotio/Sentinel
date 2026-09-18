import { z } from 'zod';

export const regionIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'must use lowercase letters, numbers, and single hyphens',
  );
