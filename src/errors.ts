import type { ContentfulStatusCode } from "hono/utils/http-status";

export class AppError extends Error {
  readonly statusCode: ContentfulStatusCode;
  readonly hint?: string;

  constructor(statusCode: ContentfulStatusCode, message: string, hint?: string) {
    super(message);
    this.statusCode = statusCode;
    this.hint = hint;
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string, hint?: string) {
    super(404, `${resource} "${id}" not found`, hint);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, hint?: string) {
    super(400, message, hint);
  }
}
