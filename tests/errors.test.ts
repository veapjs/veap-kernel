import { describe, expect, it } from "vitest";
import { AppError } from "../src/errors/app-error.js";
import { httpStatusForErrorCode } from "../src/errors/http-status.js";
import { handleActionError, ok } from "../src/errors/result.js";

describe("AppError", () => {
  it("creates errors with correct code, message and details", () => {
    const err = AppError.NotFound("User not found", { userId: 42 });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe("AppError");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("User not found");
    expect(err.details).toEqual({ userId: 42 });
    expect(err.isAppError).toBe(true);
  });

  it("exposes factory methods for standard error codes", () => {
    expect(AppError.BadRequest("Bad").code).toBe("BAD_REQUEST");
    expect(AppError.Unauthorized().code).toBe("UNAUTHORIZED");
    expect(AppError.Forbidden().code).toBe("FORBIDDEN");
    expect(AppError.Conflict("Conflict").code).toBe("CONFLICT");
    expect(AppError.RateLimited().code).toBe("RATE_LIMITED");
    expect(AppError.Internal().code).toBe("INTERNAL_SERVER_ERROR");
    expect(AppError.Validation("Invalid").code).toBe("VALIDATION_ERROR");
  });

  it("serializes to JSON format for transport", () => {
    const err = AppError.Validation("Validation failed", { field: "email" });
    expect(err.toJSON()).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: { field: "email" },
      },
    });
  });
});

describe("httpStatusForErrorCode", () => {
  it("maps domain error codes to matching HTTP status codes", () => {
    expect(httpStatusForErrorCode("BAD_REQUEST")).toBe(400);
    expect(httpStatusForErrorCode("UNAUTHORIZED")).toBe(401);
    expect(httpStatusForErrorCode("FORBIDDEN")).toBe(403);
    expect(httpStatusForErrorCode("NOT_FOUND")).toBe(404);
    expect(httpStatusForErrorCode("CONFLICT")).toBe(409);
    expect(httpStatusForErrorCode("VALIDATION_ERROR")).toBe(422);
    expect(httpStatusForErrorCode("RATE_LIMITED")).toBe(429);
    expect(httpStatusForErrorCode("INTERNAL_SERVER_ERROR")).toBe(500);
    expect(httpStatusForErrorCode("UNKNOWN" as any)).toBe(500);
  });
});

describe("Result and handleActionError", () => {
  it("ok() wraps data into a successful Result", () => {
    expect(ok({ user: "Alice" })).toEqual({
      success: true,
      data: { user: "Alice" },
    });
  });

  it("handleActionError formats AppError into error Result", () => {
    const appErr = AppError.NotFound("Resource missing");
    const result = handleActionError(appErr);

    expect(result).toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Resource missing",
        details: undefined,
      },
    });
  });

  it("handleActionError converts regular Error into internal error Result", () => {
    const result = handleActionError(new Error("Unexpected crash"));

    expect(result).toEqual({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected crash",
        details: undefined,
      },
    });
  });

  it("handleActionError handles non-Error values", () => {
    const result = handleActionError("string-error");

    expect(result).toEqual({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
        details: undefined,
      },
    });
  });

  it("handleActionError re-throws NEXT_REDIRECT and NEXT_NOT_FOUND", () => {
    const redirectErr = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/dashboard;307;",
    });
    expect(() => handleActionError(redirectErr)).toThrow("NEXT_REDIRECT");

    const notFoundErr = Object.assign(new Error("NEXT_NOT_FOUND"), {
      digest: "NEXT_NOT_FOUND",
    });
    expect(() => handleActionError(notFoundErr)).toThrow("NEXT_NOT_FOUND");
  });
});
