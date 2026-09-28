import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import type { IRegisterInput, ILoginInput } from '../types/auth.types';
import type { AuthenticatedRequest } from '../middleware/authenticate';
import type { AppError } from '../middleware/errorHandler';

function makeError(message: string, statusCode: number): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  return err;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

export async function registerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { name, email, password, phone } = req.body as Partial<IRegisterInput>;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return next(makeError('Name must be at least 2 characters', 400));
    }
    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return next(makeError('A valid email address is required', 400));
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return next(makeError('Password must be at least 8 characters', 400));
    }

    const result = await authService.register({ name, email, password, phone });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

export async function loginHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body as Partial<ILoginInput>;

    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return next(makeError('A valid email address is required', 400));
    }
    if (!password || typeof password !== 'string' || password.length === 0) {
      return next(makeError('Password is required', 400));
    }

    const result = await authService.login({ email, password });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/auth/me  (requires authenticate middleware)
// ---------------------------------------------------------------------------

export async function getMeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = (req as AuthenticatedRequest).user;
    const user = await authService.getMe(id);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
}
