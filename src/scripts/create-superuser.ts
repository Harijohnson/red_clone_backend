import 'dotenv/config';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import dns from 'dns';
import User from '../models/User.model';

dns.setServers(['8.8.8.8', '8.8.4.4']);

const EMAIL = 'hari@hari.com';
const PASSWORD = 'Pass@123';
const NAME = 'Hari';
const SALT_ROUNDS = 12;

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ email: EMAIL });

  if (existing) {
    existing.passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);
    existing.role = 'admin';
    existing.name = NAME;
    await existing.save();
    console.log(`Updated existing user ${EMAIL} → role: admin`);
  } else {
    const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);
    await User.create({ name: NAME, email: EMAIL, passwordHash, role: 'admin' });
    console.log(`Created admin user ${EMAIL}`);
  }

  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
