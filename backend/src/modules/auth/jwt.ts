import jsonwebtoken from 'jsonwebtoken';

export interface JwtConfiguration {
  secret: string;
  expiresIn: string;
}

function durationInSeconds(duration: string): number {
  const match = /^([1-9]\d*)([smhdw])$/.exec(duration);

  if (!match) {
    throw new Error('JWT expiration duration is invalid');
  }

  const amount = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    case 'd':
      return amount * 60 * 60 * 24;
    case 'w':
      return amount * 60 * 60 * 24 * 7;
    default:
      throw new Error('JWT expiration duration is invalid');
  }
}

export function createAccessToken(userId: string, configuration: JwtConfiguration): string {
  return jsonwebtoken.sign({}, configuration.secret, {
    algorithm: 'HS256',
    subject: userId,
    expiresIn: durationInSeconds(configuration.expiresIn),
  });
}

export function verifyAccessToken(token: string, configuration: JwtConfiguration): string {
  const payload = jsonwebtoken.verify(token, configuration.secret, {
    algorithms: ['HS256'],
  });

  if (typeof payload === 'string' || typeof payload.sub !== 'string') {
    throw new Error('JWT subject is missing');
  }

  return payload.sub;
}
