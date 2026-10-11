import { AppError } from "./app-error.js";
import type { ErrorCode } from "./types.js";

export type AppErrorJson = {
  code: ErrorCode;
  message: string;
  details?: unknown;
};

export type Result<T> =
  | { success: true; data: T; error?: never }
  | { success: false; error: AppErrorJson; data?: never };

export function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

export function handleActionError(
  e: unknown,
  _context?: string,
): Result<never> {
  if (
    e instanceof Error &&
    "digest" in e &&
    typeof (e as any).digest === "string"
  ) {
    if (
      (e as any).digest.startsWith("NEXT_REDIRECT") ||
      (e as any).digest === "NEXT_NOT_FOUND"
    ) {
      throw e;
    }
  }

  if (e instanceof AppError) {
    return e.toJSON();
  }

  if (e instanceof Error) {
    return AppError.Internal(e.message).toJSON();
  }

  return AppError.Internal("An unexpected error occurred").toJSON();
}
