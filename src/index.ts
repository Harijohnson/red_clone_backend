import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app';

let connectionPromise: Promise<void> | null = null;

function ensureDB(): Promise<void> {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!connectionPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set');
    connectionPromise = mongoose.connect(uri).then(() => {
      console.log('MongoDB connected');
    });
  }
  return connectionPromise;
}

export default async function handler(req: any, res: any) {
  await ensureDB();
  return app(req, res);
}
