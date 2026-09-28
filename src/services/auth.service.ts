import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.model';
import type { IRegisterInput, ILoginInput, IAuthResponse, IAuthUser, IJwtPayload } from '../types/auth.types';
import type { AppError } from '../middleware/errorHandler';

const SALT_ROUNDS = 12;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

function makeError(message: string, statusCode: number): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  return err;
}

function toAuthUser(doc: { _id: { toString(): string }; name: string; email: string; role: string }): IAuthUser {
  return {
    id: doc._id.toString(),
    name: doc.name,
    email: doc.email,
    role: doc.role,
  };
}

function signToken(user: IAuthUser): string {
  const payload: IJwtPayload = { sub: user.id, email: user.email, role: user.role };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export async function register(input: IRegisterInput): Promise<IAuthResponse> {
  const { name, email, password, phone } = input;

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    throw makeError('An account with this email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    role: 'customer',
    ...(phone ? { phone: phone.trim() } : {}),
  });

  const authUser = toAuthUser(user);
  return { token: signToken(authUser), user: authUser };
}

export async function login(input: ILoginInput): Promise<IAuthResponse> {
  const { email, password } = input;

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    throw makeError('Invalid email or password', 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw makeError('Invalid email or password', 401);
  }

  const authUser = toAuthUser(user);
  return { token: signToken(authUser), user: authUser };
}

export async function getMe(userId: string): Promise<IAuthUser> {
  const user = await User.findById(userId).select('-passwordHash');
  if (!user) {
    throw makeError('User not found', 404);
  }
  return toAuthUser(user);
}
