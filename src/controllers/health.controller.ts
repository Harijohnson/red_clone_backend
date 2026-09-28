import { Request, Response } from 'express';
import { HealthResponse } from '../types';

export function getHealth(_req: Request, res: Response<HealthResponse>): void {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}
