import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

// Augment Express Request interface with correlation id
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

/**
 * Middleware that ensures every request has a unique identifier.
 * Uses incoming X-Request-Id if provided and safe; otherwise generates a UUIDv4.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header('X-Request-Id');
  const validIncomingId =
    incomingId && /^[a-zA-Z0-9_-]{1,128}$/.test(incomingId) ? incomingId : null;

  const id = validIncomingId || crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);

  next();
}
