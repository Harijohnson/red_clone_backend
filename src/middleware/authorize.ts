import { Request, Response, NextFunction } from 'express';
import type { AppError } from './errorHandler';
import type { AuthenticatedRequest } from './authenticate';

function makeError(message: string, statusCode: number): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  return err;
}

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user || !roles.includes(user.role)) {
      return next(makeError('Forbidden', 403));
    }
    next();
  };
}
