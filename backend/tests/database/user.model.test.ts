import { describe, expect, it } from 'vitest';

import { UserModel } from '../../src/database/models/user';

describe('User model', () => {
  it('normalizes email and excludes passwordHash when serialized', () => {
    const user = new UserModel({
      name: 'Pulkit',
      email: '  USER@Example.COM ',
      passwordHash: 'stored-hash',
    });

    expect(user.email).toBe('user@example.com');
    expect(user.toJSON()).not.toHaveProperty('passwordHash');
  });

  it('defines timestamps, a unique email index, and a hidden password hash', () => {
    const emailIndex = UserModel.schema
      .indexes()
      .find(([fields]) => fields.email === 1);

    expect(UserModel.schema.options.timestamps).toBe(true);
    expect(emailIndex?.[1].unique).toBe(true);
    expect(UserModel.schema.path('passwordHash').options.select).toBe(false);
  });
});
