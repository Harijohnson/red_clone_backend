import 'dotenv/config';
import http from 'http';
import app from './app';
import { connectDB, disconnectDB } from './config/database';
import { sweepExpiredLocks } from './services/seat.service';

const PORT = Number(process.env.PORT) || 5000;
const SWEEP_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

async function start(): Promise<void> {
  await connectDB();

  const server = http.createServer(app);

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Release stale seat locks on a background interval
  const sweepTimer = setInterval(() => {
    sweepExpiredLocks().catch((err: unknown) => {
      console.error('Seat lock sweeper error:', err);
    });
  }, SWEEP_INTERVAL_MS);

  async function shutdown(signal: string): Promise<void> {
    console.log(`${signal} received — shutting down`);
    clearInterval(sweepTimer);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err: Error) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
