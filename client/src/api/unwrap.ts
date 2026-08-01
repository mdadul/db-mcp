import type { z } from "zod";

export interface HonoResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export interface ErrorResponse {
  error?: string;
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ErrorResponse).error === "string"
  );
}

/**
 * Reads response body once, throws a meaningful error on non-2xx status,
 * and optionally validates the response structure using a Zod schema for 100% type safety.
 */
export async function unwrap<T>(
  res: HonoResponse,
  schema?: z.ZodType<T>
): Promise<T> {
  let data: unknown;

  try {
    data = await res.json();
  } catch (err) {
    // Network error, server down, or invalid JSON response
    if (!res.ok) {
      throw new Error(
        `Server error (${res.status}): Unable to parse response. Server may be unreachable.`
      );
    }
    throw new Error("Invalid JSON response from server");
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    if (isErrorResponse(data) && data.error) {
      message = data.error;
    }
    throw new Error(message);
  }

  if (schema) {
    return schema.parse(data);
  }

  return data as T;
}
