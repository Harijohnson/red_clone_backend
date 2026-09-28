import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  const err: AppError = Object.assign(new Error(`Not Found — ${req.originalUrl}`), {
    statusCode: 404,
  });
  next(err);
}
