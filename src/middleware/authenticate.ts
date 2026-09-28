import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { IJwtPayload } from '../types/auth.types';
import type { AppError } from './errorHandler';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

function makeError(message: string, statusCode: number): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  return err;
}

/** Like authenticate, but never rejects — just skips populating req.user if no/invalid token. */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) return next();

  try {
    const payload = jwt.verify(token, secret) as IJwtPayload;
    (req as AuthenticatedRequest).user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  } catch {
  }
  next();
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(makeError('Authentication token required', 401));
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return next(makeError('Server misconfiguration', 500));
  }

  try {
    const payload = jwt.verify(token, secret) as IJwtPayload;
    (req as AuthenticatedRequest).user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch {
    next(makeError('Invalid or expired token', 401));
  }
}
