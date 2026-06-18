/** Base for all domain errors. Carries an HTTP status the API layer maps directly. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'validation failed', details?: unknown) {
    super('validation', message, 400, details);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'unauthorized') {
    super('unauthorized', message, 401);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = 'forbidden') {
    super('forbidden', message, 403);
  }
}
export class NotFoundError extends AppError {
  constructor(what = 'resource') {
    super('not_found', `${what} not found`, 404);
  }
}
export class ConflictError extends AppError {
  constructor(message = 'conflict') {
    super('conflict', message, 409);
  }
}
export class QuotaExceededError extends AppError {
  constructor(limit: string, max: number) {
    super('quota_exceeded', `quota exceeded for ${limit} (max ${max})`, 422, { limit, max });
  }
}
