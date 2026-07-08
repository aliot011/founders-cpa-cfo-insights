import type { NextFunction, Request, Response } from 'express';

export type ApiErrorCode = 'needs_reauth' | 'not_found' | 'qbo_error' | 'sync_in_progress' | 'bad_request';

export class ApiError extends Error {
  status: number;
  code?: ApiErrorCode;

  constructor(status: number, message: string, code?: ApiErrorCode) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Express error middleware; must keep the 4-arg signature.
export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error('Unhandled error:', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}
