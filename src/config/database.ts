import mongoose from 'mongoose';
import dns from 'dns';

// Router blocks SRV queries; force public DNS so Atlas +srv URIs resolve
dns.setServers(['8.8.8.8', '8.8.4.4']);

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }
  return uri;
}

export async function connectDB(): Promise<void> {
  const uri = getMongoUri();

  mongoose.connection.on('connected', () => {
    console.log('MongoDB connected');
  });

  mongoose.connection.on('error', (err: Error) => {
    console.error('MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });

  await mongoose.connect(uri);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.connection.close();
  console.log('MongoDB connection closed');
}
