export type Result<T, E extends { code: string; message: string } = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export interface AppError {
  code: string
  message: string
  cause?: unknown
  retryable?: boolean
}

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E extends { code: string; message: string }>(error: E): Result<never, E> {
  return { ok: false, error }
}

export function appError(code: string, message: string, cause?: unknown, retryable = false): AppError {
  return { code, message, cause, retryable }
}
