import { Request, Response, NextFunction } from 'express';
import { listBuses, createBus, updateBus, deleteBus } from '../../services/admin/bus.admin.service';
import type { AppError } from '../../middleware/errorHandler';
import type { ICreateBusRequest, IUpdateBusRequest } from '../../types/admin.types';

function makeError(message: string, statusCode: number): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  return err;
}

// GET /api/admin/buses
export async function listBusesHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await listBuses();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/buses
export async function createBusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as ICreateBusRequest;
    if (!body.registrationNumber || !body.name || !body.operatedBy) {
      return next(makeError('registrationNumber, name, and operatedBy are required', 400));
    }
    const result = await createBus(body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/buses/:busId
export async function updateBusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const busId = req.params['busId'] as string;
    const body = req.body as IUpdateBusRequest;
    const result = await updateBus(busId, body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/buses/:busId
export async function deleteBusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const busId = req.params['busId'] as string;
    await deleteBus(busId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
