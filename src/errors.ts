import type { ContentfulStatusCode } from "hono/utils/http-status";

export class AppError extends Error {
  readonly statusCode: ContentfulStatusCode;

  constructor(statusCode: ContentfulStatusCode, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(404, `${resource} "${id}" not found`);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}
