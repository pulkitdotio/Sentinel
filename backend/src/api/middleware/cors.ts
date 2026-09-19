import type { RequestHandler } from 'express';

const ALLOWED_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Authorization, Content-Type';

export function createCorsMiddleware(clientOrigin: string): RequestHandler {
  return (request, response, next) => {
    const requestOrigin = request.header('origin');

    if (requestOrigin === undefined) {
      next();
      return;
    }

    response.vary('Origin');

    if (requestOrigin !== clientOrigin) {
      next();
      return;
    }

    response.setHeader('Access-Control-Allow-Origin', clientOrigin);

    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      response.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      response.status(204).send();
      return;
    }

    next();
  };
}
