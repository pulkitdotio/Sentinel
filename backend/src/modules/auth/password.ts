import argon2 from 'argon2';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$IkZJBOaogvs/m2B0n7nHmg$lppBPpCSoAJ3PlDweEsrzxLymbgsOCG464BWWWwenug';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return argon2.verify(passwordHash, password);
}

export async function verifyPasswordOrDummy(
  passwordHash: string | undefined,
  password: string,
): Promise<boolean> {
  return verifyPassword(passwordHash ?? DUMMY_PASSWORD_HASH, password);
}
