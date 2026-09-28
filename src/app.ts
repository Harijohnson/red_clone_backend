import express, { Application } from 'express';
import cors from 'cors';
import healthRouter from './routes/health.routes';
import authRouter from './routes/auth.routes';
import tripRouter from './routes/trip.routes';
import seatRouter from './routes/seat.routes';
import bookingRouter from './routes/booking.routes';
import adminRouter from './routes/admin/index.routes';
import { notFound } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';

const app: Application = express();

const ALLOWED_ORIGINS = [
  /\.vercel\.app$/,
  /^http:\/\/localhost:\d+$/,
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.some((o) => o.test(origin))) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/trips', tripRouter);
app.use('/api/trips/:tripId', seatRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/admin', adminRouter);

app.use('/api', notFound);

app.use(errorHandler);

export default app;
