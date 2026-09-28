import { Request, Response, NextFunction } from 'express';
import { listRoutes, createRoute, deleteRoute } from '../../services/admin/route.admin.service';
import type { AppError } from '../../middleware/errorHandler';
import type { ICreateRouteRequest } from '../../types/admin.types';

function makeError(message: string, statusCode: number): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  return err;
}

// GET /api/admin/routes
export async function listRoutesHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await listRoutes();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/routes
export async function createRouteHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as ICreateRouteRequest;
    if (!body.source || !body.destination) {
      return next(makeError('source and destination are required', 400));
    }
    const result = await createRoute(body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/routes/:routeId
export async function deleteRouteHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const routeId = req.params['routeId'] as string;
    await deleteRoute(routeId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
