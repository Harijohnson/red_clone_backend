import { Types } from 'mongoose';

export type UserRole = 'customer' | 'operator' | 'admin';

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  phone?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser {
  _id: Types.ObjectId;
}
