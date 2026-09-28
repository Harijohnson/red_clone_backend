import 'dotenv/config';
import dns from 'dns';
import mongoose, { Types } from 'mongoose';

dns.setServers(['8.8.8.8', '8.8.4.4']);
import User from './models/User.model';
import Bus from './models/Bus.model';
import Route from './models/Route.model';
import Trip from './models/Trip.model';
import type { ISeatLayout } from './types/bus.types';
import type { ISeatInventoryEntry } from './types/trip.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  return uri;
}

/** Return a Date for "today + daysOffset" at the given HH:MM IST (UTC+5:30). */
function tripDate(daysOffset: number, hh: number, mm: number): Date {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + daysOffset);
  // IST offset = 330 minutes = 19800 seconds
  const istOffsetMs = 5 * 60 * 60 * 1000 + 30 * 60 * 1000;
  return new Date(base.getTime() + hh * 3600_000 + mm * 60_000 - istOffsetMs);
}

/**
 * Generate a physical seat layout for a bus.
 * Produces a grid with 2 columns on the left, aisle, 1 column on the right
 * (standard South Indian bus pattern). Sleepers use lower/upper decks.
 */
function generateSeatLayout(
  totalSeats: number,
  seatType: 'seater' | 'sleeper' | 'semi-sleeper',
): ISeatLayout[] {
  const layout: ISeatLayout[] = [];
  const isSleeper = seatType === 'sleeper';

  if (isSleeper) {
    // Lower deck: half the seats, upper deck: remaining
    const lowerCount = Math.ceil(totalSeats / 2);
    const upperCount = totalSeats - lowerCount;

    for (let i = 0; i < lowerCount; i++) {
      layout.push({
        seatNumber: `L${i + 1}`,
        deck: 'lower',
        row: Math.floor(i / 2) + 1,
        column: (i % 2) + 1,
        type: i % 2 === 0 ? 'window' : 'aisle',
      });
    }
    for (let i = 0; i < upperCount; i++) {
      layout.push({
        seatNumber: `U${i + 1}`,
        deck: 'upper',
        row: Math.floor(i / 2) + 1,
        column: (i % 2) + 1,
        type: i % 2 === 0 ? 'window' : 'aisle',
      });
    }
  } else {
    // Single deck: 3-column layout (window, middle, aisle per row side)
    for (let i = 0; i < totalSeats; i++) {
      const row = Math.floor(i / 3) + 1;
      const col = (i % 3) + 1;
      const positionMap: ISeatLayout['type'][] = ['window', 'middle', 'aisle'];
      layout.push({
        seatNumber: `S${i + 1}`,
        deck: 'single',
        row,
        column: col,
        type: positionMap[col - 1],
      });
    }
  }

  return layout;
}

/** Build a trip's seat inventory from a bus's physical layout — all seats start available. */
function buildSeatInventory(layout: ISeatLayout[]): ISeatInventoryEntry[] {
  return layout.map((seat) => ({
    seatNumber: seat.seatNumber,
    status: 'available' as const,
  }));
}

// ---------------------------------------------------------------------------
// Seed data definitions
// ---------------------------------------------------------------------------

interface OperatorSeed {
  name: string;
  email: string;
  phone: string;
}

const operators: OperatorSeed[] = [
  { name: 'KPN Travels', email: 'ops@kpntravels.in', phone: '9876500001' },
  { name: 'SRS Travels', email: 'ops@srstravels.in', phone: '9876500002' },
  { name: 'TNSTC (TN)', email: 'ops@tnstc.in', phone: '9876500003' },
];

interface BusSeed {
  operatorIndex: number;
  registrationNumber: string;
  name: string;
  totalSeats: number;
  seatType: 'seater' | 'sleeper' | 'semi-sleeper';
  amenities: string[];
}

const busesSeed: BusSeed[] = [
  // KPN
  {
    operatorIndex: 0,
    registrationNumber: 'TN33AM0001',
    name: 'KPN Ultra Deluxe',
    totalSeats: 40,
    seatType: 'sleeper',
    amenities: ['AC', 'WiFi', 'Charging Point', 'Blanket'],
  },
  {
    operatorIndex: 0,
    registrationNumber: 'TN33AM0002',
    name: 'KPN Express',
    totalSeats: 45,
    seatType: 'seater',
    amenities: ['AC', 'Charging Point'],
  },
  // SRS
  {
    operatorIndex: 1,
    registrationNumber: 'TN19BZ0010',
    name: 'SRS Semi Sleeper',
    totalSeats: 42,
    seatType: 'semi-sleeper',
    amenities: ['AC', 'WiFi', 'Water Bottle'],
  },
  {
    operatorIndex: 1,
    registrationNumber: 'TN19BZ0011',
    name: 'SRS Gold Class',
    totalSeats: 36,
    seatType: 'sleeper',
    amenities: ['AC', 'WiFi', 'Charging Point', 'Blanket', 'Snacks'],
  },
  // TNSTC
  {
    operatorIndex: 2,
    registrationNumber: 'TN38CK2201',
    name: 'TNSTC Ultra Deluxe',
    totalSeats: 50,
    seatType: 'seater',
    amenities: ['AC'],
  },
  {
    operatorIndex: 2,
    registrationNumber: 'TN38CK2202',
    name: 'TNSTC Express',
    totalSeats: 52,
    seatType: 'seater',
    amenities: [],
  },
];

interface RouteSeed {
  source: string;
  destination: string;
  distanceKm: number;
  estimatedDurationMinutes: number;
}

const routesSeed: RouteSeed[] = [
  // Primary test route
  { source: 'Coimbatore', destination: 'Chennai', distanceKm: 500, estimatedDurationMinutes: 480 },
  { source: 'Chennai', destination: 'Coimbatore', distanceKm: 500, estimatedDurationMinutes: 480 },
  // Additional routes
  { source: 'Coimbatore', destination: 'Bengaluru', distanceKm: 360, estimatedDurationMinutes: 360 },
  { source: 'Bengaluru', destination: 'Coimbatore', distanceKm: 360, estimatedDurationMinutes: 360 },
  { source: 'Chennai', destination: 'Madurai', distanceKm: 460, estimatedDurationMinutes: 420 },
  { source: 'Madurai', destination: 'Chennai', distanceKm: 460, estimatedDurationMinutes: 420 },
  { source: 'Chennai', destination: 'Bengaluru', distanceKm: 346, estimatedDurationMinutes: 330 },
  { source: 'Bengaluru', destination: 'Chennai', distanceKm: 346, estimatedDurationMinutes: 330 },
  { source: 'Coimbatore', destination: 'Madurai', distanceKm: 160, estimatedDurationMinutes: 180 },
  { source: 'Madurai', destination: 'Coimbatore', distanceKm: 160, estimatedDurationMinutes: 180 },
  { source: 'Bengaluru', destination: 'Hyderabad', distanceKm: 570, estimatedDurationMinutes: 540 },
  { source: 'Hyderabad', destination: 'Bengaluru', distanceKm: 570, estimatedDurationMinutes: 540 },
];

interface TripSeed {
  busIndex: number;
  routeKey: string; // "source→destination"
  daysOffset: number;
  departureHH: number;
  departureMM: number;
  pricePerSeat: number;
}

// routeKey must match "source→destination" built from routesSeed entries
const tripsSeed: TripSeed[] = [
  // Coimbatore → Chennai  (multiple operators, multiple days)
  { busIndex: 0, routeKey: 'Coimbatore→Chennai', daysOffset: 1, departureHH: 21, departureMM: 0,  pricePerSeat: 850 },
  { busIndex: 1, routeKey: 'Coimbatore→Chennai', daysOffset: 1, departureHH: 22, departureMM: 30, pricePerSeat: 650 },
  { busIndex: 2, routeKey: 'Coimbatore→Chennai', daysOffset: 1, departureHH: 20, departureMM: 0,  pricePerSeat: 750 },
  { busIndex: 3, routeKey: 'Coimbatore→Chennai', daysOffset: 2, departureHH: 21, departureMM: 30, pricePerSeat: 950 },
  { busIndex: 4, routeKey: 'Coimbatore→Chennai', daysOffset: 2, departureHH: 6,  departureMM: 0,  pricePerSeat: 500 },

  // Chennai → Coimbatore
  { busIndex: 0, routeKey: 'Chennai→Coimbatore', daysOffset: 1, departureHH: 22, departureMM: 0,  pricePerSeat: 850 },
  { busIndex: 2, routeKey: 'Chennai→Coimbatore', daysOffset: 2, departureHH: 21, departureMM: 0,  pricePerSeat: 750 },
  { busIndex: 5, routeKey: 'Chennai→Coimbatore', daysOffset: 1, departureHH: 7,  departureMM: 0,  pricePerSeat: 480 },

  // Coimbatore → Bengaluru
  { busIndex: 1, routeKey: 'Coimbatore→Bengaluru', daysOffset: 1, departureHH: 6, departureMM: 30, pricePerSeat: 600 },
  { busIndex: 3, routeKey: 'Coimbatore→Bengaluru', daysOffset: 1, departureHH: 22, departureMM: 0, pricePerSeat: 900 },

  // Chennai → Madurai
  { busIndex: 2, routeKey: 'Chennai→Madurai', daysOffset: 1, departureHH: 23, departureMM: 0,  pricePerSeat: 700 },
  { busIndex: 4, routeKey: 'Chennai→Madurai', daysOffset: 2, departureHH: 6,  departureMM: 0,  pricePerSeat: 450 },

  // Chennai → Bengaluru
  { busIndex: 0, routeKey: 'Chennai→Bengaluru', daysOffset: 1, departureHH: 21, departureMM: 30, pricePerSeat: 800 },
  { busIndex: 3, routeKey: 'Chennai→Bengaluru', daysOffset: 2, departureHH: 22, departureMM: 0,  pricePerSeat: 950 },

  // Bengaluru → Hyderabad
  { busIndex: 1, routeKey: 'Bengaluru→Hyderabad', daysOffset: 1, departureHH: 20, departureMM: 0, pricePerSeat: 700 },
  { busIndex: 3, routeKey: 'Bengaluru→Hyderabad', daysOffset: 2, departureHH: 21, departureMM: 0, pricePerSeat: 950 },

  // Coimbatore → Madurai
  { busIndex: 5, routeKey: 'Coimbatore→Madurai', daysOffset: 1, departureHH: 8, departureMM: 0, pricePerSeat: 300 },
  { busIndex: 4, routeKey: 'Coimbatore→Madurai', daysOffset: 1, departureHH: 14, departureMM: 0, pricePerSeat: 280 },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  await mongoose.connect(mongoUri());
  console.log('Connected to MongoDB');

  // Clear collections
  await Promise.all([
    Trip.deleteMany({}),
    Bus.deleteMany({}),
    Route.deleteMany({}),
    // Remove only seed operator accounts; identified by the seed email domain
    User.deleteMany({ email: { $in: operators.map((o) => o.email) } }),
  ]);
  console.log('Cleared existing seed data');

  // Insert operators (needed as Bus.operatedBy refs)
  const operatorDocs = await User.insertMany(
    operators.map((o) => ({
      name: o.name,
      email: o.email,
      passwordHash: '$2b$10$placeholder_not_used_for_login',
      role: 'operator' as const,
      phone: o.phone,
    }))
  );
  console.log(`Inserted ${operatorDocs.length} operators`);

  const operatorIds: Types.ObjectId[] = operatorDocs.map((d) => d._id);

  // Insert buses — seatLayout is generated from totalSeats + seatType
  const busDocs = await Bus.insertMany(
    busesSeed.map((b) => ({
      registrationNumber: b.registrationNumber,
      name: b.name,
      totalSeats: b.totalSeats,
      seatType: b.seatType,
      seatLayout: generateSeatLayout(b.totalSeats, b.seatType),
      amenities: b.amenities,
      status: 'active' as const,
      operatedBy: operatorIds[b.operatorIndex],
    }))
  );
  console.log(`Inserted ${busDocs.length} buses`);

  const busIds: Types.ObjectId[] = busDocs.map((d) => d._id);

  // Insert routes
  const routeDocs = await Route.insertMany(routesSeed);
  console.log(`Inserted ${routeDocs.length} routes`);

  // Build lookup: "source→destination" → ObjectId
  const routeMap = new Map<string, Types.ObjectId>(
    routeDocs.map((r) => [`${r.source}→${r.destination}`, r._id])
  );

  // Insert trips
  const tripPayloads = tripsSeed.map((t) => {
    const routeId = routeMap.get(t.routeKey);
    if (!routeId) throw new Error(`Route not found for key: ${t.routeKey}`);

    const routeSeed = routesSeed.find(
      (r) => `${r.source}→${r.destination}` === t.routeKey
    );
    if (!routeSeed) throw new Error(`Route seed missing for key: ${t.routeKey}`);

    const busDoc = busDocs[t.busIndex];
    const departure = tripDate(t.daysOffset, t.departureHH, t.departureMM);
    const arrival = new Date(
      departure.getTime() + routeSeed.estimatedDurationMinutes * 60_000
    );

    const seatInventory = buildSeatInventory(busDoc.seatLayout);

    return {
      bus: busIds[t.busIndex],
      route: routeId,
      departureTime: departure,
      arrivalTime: arrival,
      pricePerSeat: t.pricePerSeat,
      totalSeats: busDoc.totalSeats,
      seatInventory,
      availableCount: busDoc.totalSeats,
      status: 'scheduled' as const,
    };
  });

  const tripDocs = await Trip.insertMany(tripPayloads);
  console.log(`Inserted ${tripDocs.length} trips`);

  // Summary
  console.log('\n--- Seed summary ---');
  console.log(`Operators : ${operatorDocs.length}`);
  console.log(`Buses     : ${busDocs.length}`);
  console.log(`Routes    : ${routeDocs.length}`);
  console.log(`Trips     : ${tripDocs.length}`);

  const cbChennaiTrips = tripDocs.filter((_, i) =>
    tripsSeed[i].routeKey === 'Coimbatore→Chennai'
  );
  console.log(`\nCoimbatore → Chennai trips: ${cbChennaiTrips.length}`);

  await mongoose.disconnect();
  console.log('\nDone. MongoDB connection closed.');
}

seed().catch((err: unknown) => {
  console.error('Seed failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
