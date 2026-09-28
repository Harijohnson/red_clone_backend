import { Types } from 'mongoose';

export interface IRoute {
  source: string;
  destination: string;
  distanceKm: number;
  estimatedDurationMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRouteDocument extends IRoute {
  _id: Types.ObjectId;
}
