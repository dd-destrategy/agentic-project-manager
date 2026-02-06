/**
 * Structured API error responses.
 *
 * Provides a consistent error shape across all API routes:
 * { error: string, code: string, details?: unknown }
 */

import { NextResponse } from 'next/server';

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORISED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'INTERNAL_ERROR'
  | 'LLM_ERROR'
  | 'BAD_REQUEST'
  | 'MESSAGE_LIMIT_EXCEEDED';

/**
 * Return a structured JSON error response.
 */
export function apiError(
  status: number,
  code: ErrorCode,
  error: string,
  details?: unknown
): NextResponse<ApiError> {
  const body: ApiError = { error, code };
  if (details !== undefined) {
    body.details = details;
  }
  return NextResponse.json(body, { status });
}

/** 400 Bad Request */
export function badRequest(error: string, details?: unknown) {
  return apiError(400, 'BAD_REQUEST', error, details);
}

/** 400 Validation Error (e.g. Zod failures) */
export function validationError(error: string, details?: unknown) {
  return apiError(400, 'VALIDATION_ERROR', error, details);
}

/** 401 Unauthorised */
export function unauthorised(error = 'Unauthorised') {
  return apiError(401, 'UNAUTHORISED', error);
}

/** 404 Not Found */
export function notFound(error: string) {
  return apiError(404, 'NOT_FOUND', error);
}

/** 409 Conflict */
export function conflict(error: string) {
  return apiError(409, 'CONFLICT', error);
}

/** 429 Rate Limited */
export function rateLimited(error: string) {
  return apiError(429, 'RATE_LIMITED', error);
}

/** 429 Budget Exceeded */
export function budgetExceeded(error: string, details?: unknown) {
  return apiError(429, 'BUDGET_EXCEEDED', error, details);
}

/** 500 Internal Error */
export function internalError(error: string, details?: unknown) {
  return apiError(500, 'INTERNAL_ERROR', error, details);
}

/** 500 LLM Error */
export function llmError(error: string, details?: unknown) {
  return apiError(500, 'LLM_ERROR', error, details);
}
