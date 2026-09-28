import 'dotenv/config';
import app from './app';
import { connectDB } from './config/database';

connectDB().catch((err: Error) => {
  console.error('DB connection failed:', err.message);
});

export default app;
