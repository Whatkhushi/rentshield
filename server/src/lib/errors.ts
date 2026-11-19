/**
 * Throw an ApiError anywhere in a route or service; the error middleware
 * turns it into `{ error: { code, message, details } }` with the right status.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Not logged in') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have access to this') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(what = 'Resource') {
    return new ApiError(404, 'NOT_FOUND', `${what} not found`);
  }
  static conflict(code: string, message: string) {
    return new ApiError(409, code, message);
  }
}
