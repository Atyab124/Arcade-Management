export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string, public readonly details?: unknown) {
    super(message);
    this.name = 'HttpError';
  }
}

export const BadRequest = (message: string, details?: unknown) => new HttpError(400, message, 'bad_request', details);
export const Unauthorized = (message = 'unauthorized') => new HttpError(401, message, 'unauthorized');
export const Forbidden = (message = 'forbidden') => new HttpError(403, message, 'forbidden');
export const NotFound = (message = 'not_found') => new HttpError(404, message, 'not_found');
export const Conflict = (message: string) => new HttpError(409, message, 'conflict');
export const UnprocessableEntity = (message: string, details?: unknown) => new HttpError(422, message, 'unprocessable', details);
export const TooManyRequests = (message = 'rate_limited') => new HttpError(429, message, 'rate_limited');
