export class ApiError extends Error {
  constructor(status, message, code = undefined) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg, code) => new ApiError(400, msg, code);
export const unauthorized = (msg = 'Unauthorized') => new ApiError(401, msg);
export const forbidden = (msg = 'You do not have permission to perform this action') => new ApiError(403, msg);
export const notFound = (msg = 'Resource not found') => new ApiError(404, msg);
export const conflict = (msg, code) => new ApiError(409, msg, code);
