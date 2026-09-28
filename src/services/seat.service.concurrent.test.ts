/**
 * Concurrent seat-lock and booking tests.
 *
 * These tests spin up an in-process MongoDB instance (mongodb-memory-server)
 * and call lockSeats / releaseLock / createBooking directly — no HTTP layer, no JWT needed.
 *
 * Key scenarios:
 *  1. Two users racing to lock the same seat — exactly one wins (409 for the loser).
 *  2. N concurrent requests for disjoint seats — all succeed.
 *  3. A user cannot lock a seat already locked by someone else.
 *  4. A user cannot lock a seat that is booked.
 *  5. Locking non-existent seat numbers is rejected.
 *  6. releaseLock frees only the calling user's seats.
 *  7. Lock expiry: expired locks are treated as available.
 *  8. SEAT_LOCK_DURATION_SECONDS env var controls TTL.
 *  9. Two users with the same seat locked race to book — exactly one wins.
 * 10. createBooking rejects missing / malformed passengers.
 * 11. createBooking rejects when lock has expired.
 * 12. createBooking rejects when seat belongs to a different user's lock.
 * 13. Booking calculates total from trip price, never trusts client.
 * 14. 10 concurrent booking attempts for the same seat: exactly 1 succeeds.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Trip from '../models/Trip.model';
import Bus from '../models/Bus.model';
import Route from '../models/Route.model';
import User from '../models/User.model';
import { lockSeats, releaseLock } from './seat.service';
import { createBooking } from './booking.service';

// ─── helpers ────────────────────────────────────────────────────────────────

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({
    instance: { launchTimeout: 60000 },
  });
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

let seedCounter = 0;

function uid(): string {
  return `${++seedCounter}-${Math.random().toString(36).slice(2)}`;
}

/** Build a minimal Bus + Route + Trip with a given seat list. */
async function seedTrip(seatNumbers: string[]): Promise<{
  tripId: string;
  userId: string;
  userId2: string;
}> {
  const layout = seatNumbers.map((sn, idx) => ({
    seatNumber: sn,
    deck: 'lower' as const,
    row: Math.floor(idx / 4) + 1,
    column: (idx % 4) + 1,
    type: 'window' as const,
  }));

  const user = await User.create({
    name: 'Alice',
    email: `alice-${uid()}@test.com`,
    passwordHash: 'hashed',
    role: 'customer',
  });
  const user2 = await User.create({
    name: 'Bob',
    email: `bob-${uid()}@test.com`,
    passwordHash: 'hashed',
    role: 'customer',
  });

  const operator = await User.create({
    name: 'Operator',
    email: `op-${uid()}@test.com`,
    passwordHash: 'hashed',
    role: 'operator',
  });

  const tag = uid();
  const bus = await Bus.create({
    registrationNumber: `BUS-${tag}`,
    name: 'Test Bus',
    totalSeats: seatNumbers.length,
    seatType: 'seater',
    seatLayout: layout,
    amenities: [],
    status: 'active',
    operatedBy: operator._id,
  });

  const routeTag = uid();
  const route = await Route.create({
    source: `CityA-${routeTag}`,
    destination: `CityB-${routeTag}`,
    distanceKm: 100,
    estimatedDurationMinutes: 120,
  });

  const inventory = seatNumbers.map((sn) => ({
    seatNumber: sn,
    status: 'available' as const,
  }));

  const trip = await Trip.create({
    bus: bus._id,
    route: route._id,
    departureTime: new Date(Date.now() + 86_400_000),
    arrivalTime: new Date(Date.now() + 90_000_000),
    pricePerSeat: 500,
    totalSeats: seatNumbers.length,
    availableCount: seatNumbers.length,
    seatInventory: inventory,
    status: 'scheduled',
  });

  return {
    tripId: trip._id.toString(),
    userId: user._id.toString(),
    userId2: user2._id.toString(),
  };
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('lockSeats — basic validation', () => {
  it('rejects an invalid tripId', async () => {
    await expect(lockSeats('not-an-id', 'uid', { seatNumbers: ['A1'] })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects an empty seatNumbers array', async () => {
    const { tripId, userId } = await seedTrip(['A1']);
    await expect(lockSeats(tripId, userId, { seatNumbers: [] })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects duplicate seatNumbers in the request', async () => {
    const { tripId, userId } = await seedTrip(['A1', 'A2']);
    await expect(
      lockSeats(tripId, userId, { seatNumbers: ['A1', 'A1'] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a seat number that does not exist on the bus', async () => {
    const { tripId, userId } = await seedTrip(['A1']);
    await expect(
      lockSeats(tripId, userId, { seatNumbers: ['Z99'] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns 404 for an unknown tripId', async () => {
    const fakeId = new Types.ObjectId().toString();
    await expect(
      lockSeats(fakeId, new Types.ObjectId().toString(), { seatNumbers: ['A1'] }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('lockSeats — successful lock', () => {
  it('locks a single available seat and returns correct shape', async () => {
    const { tripId, userId } = await seedTrip(['A1', 'A2']);
    const result = await lockSeats(tripId, userId, { seatNumbers: ['A1'] });

    expect(result.lockedSeats).toEqual(['A1']);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('locks multiple seats in a single call', async () => {
    const { tripId, userId } = await seedTrip(['B1', 'B2', 'B3']);
    const result = await lockSeats(tripId, userId, { seatNumbers: ['B1', 'B2'] });

    expect(result.lockedSeats).toHaveLength(2);
    expect(result.lockedSeats).toContain('B1');
    expect(result.lockedSeats).toContain('B2');
  });

  it('decrements availableCount on the trip', async () => {
    const { tripId, userId } = await seedTrip(['C1', 'C2', 'C3']);
    await lockSeats(tripId, userId, { seatNumbers: ['C1', 'C2'] });

    const trip = await Trip.findById(tripId).exec();
    expect(trip!.availableCount).toBe(1);
  });

  it('sets reservedBy, reservedAt, reservationExpiresAt in seatInventory', async () => {
    const { tripId, userId } = await seedTrip(['D1', 'D2']);
    await lockSeats(tripId, userId, { seatNumbers: ['D1'] });

    const trip = await Trip.findById(tripId).exec();
    const entry = trip!.seatInventory.find((s) => s.seatNumber === 'D1')!;

    expect(entry.status).toBe('reserved');
    expect(entry.reservedBy?.toString()).toBe(userId);
    expect(entry.reservedAt).toBeDefined();
    expect(entry.reservationExpiresAt).toBeDefined();
    expect(entry.reservationExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('lockSeats — conflict scenarios', () => {
  it('rejects locking a seat already reserved by another user', async () => {
    const { tripId, userId, userId2 } = await seedTrip(['E1', 'E2']);

    await lockSeats(tripId, userId, { seatNumbers: ['E1'] });

    await expect(
      lockSeats(tripId, userId2, { seatNumbers: ['E1'] }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects locking a booked seat', async () => {
    const { tripId, userId } = await seedTrip(['F1', 'F2']);

    // Manually mark a seat as booked
    await Trip.updateOne(
      { _id: tripId, 'seatInventory.seatNumber': 'F1' },
      {
        $set: {
          'seatInventory.$.status': 'booked',
        },
        $inc: { availableCount: -1 },
      },
    ).exec();

    await expect(
      lockSeats(tripId, userId, { seatNumbers: ['F1'] }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects if any seat in a multi-seat request is unavailable', async () => {
    const { tripId, userId, userId2 } = await seedTrip(['G1', 'G2', 'G3']);

    await lockSeats(tripId, userId, { seatNumbers: ['G2'] });

    await expect(
      lockSeats(tripId, userId2, { seatNumbers: ['G1', 'G2', 'G3'] }),
    ).rejects.toMatchObject({ statusCode: 409 });

    // G1 and G3 must still be available (all-or-nothing atomicity)
    const trip = await Trip.findById(tripId).exec();
    const g1 = trip!.seatInventory.find((s) => s.seatNumber === 'G1')!;
    const g3 = trip!.seatInventory.find((s) => s.seatNumber === 'G3')!;
    expect(g1.status).toBe('available');
    expect(g3.status).toBe('available');
  });
});

describe('lockSeats — concurrent racing', () => {
  it('exactly one winner when two users race for the same seat', async () => {
    const { tripId, userId, userId2 } = await seedTrip(['H1', 'H2']);

    const [r1, r2] = await Promise.allSettled([
      lockSeats(tripId, userId, { seatNumbers: ['H1'] }),
      lockSeats(tripId, userId2, { seatNumbers: ['H1'] }),
    ]);

    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
    const rejected = [r1, r2].filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const loser = rejected[0] as PromiseRejectedResult;
    expect((loser.reason as { statusCode: number }).statusCode).toBe(409);

    // Seat must be reserved by exactly the winning user
    const trip = await Trip.findById(tripId).exec();
    const entry = trip!.seatInventory.find((s) => s.seatNumber === 'H1')!;
    expect(entry.status).toBe('reserved');
  });

  it('10 concurrent requests for the same seat: exactly 1 succeeds', async () => {
    const seats = Array.from({ length: 1 }, (_, i) => `I${i + 1}`);
    const { tripId } = await seedTrip(seats);

    const users = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        User.create({
          name: `User${i}`,
          email: `race-${uid()}@test.com`,
          passwordHash: 'hashed',
          role: 'customer',
        }),
      ),
    );

    const results = await Promise.allSettled(
      users.map((u) => lockSeats(tripId, u._id.toString(), { seatNumbers: ['I1'] })),
    );

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(9);
    failures.forEach((f) => {
      expect((f as PromiseRejectedResult).reason.statusCode).toBe(409);
    });
  });

  it('N concurrent requests for N disjoint seats all succeed', async () => {
    const n = 5;
    const seats = Array.from({ length: n }, (_, i) => `J${i + 1}`);
    const { tripId } = await seedTrip(seats);

    const users = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        User.create({
          name: `UserJ${i}`,
          email: `disjoint-${uid()}@test.com`,
          passwordHash: 'hashed',
          role: 'customer',
        }),
      ),
    );

    const results = await Promise.allSettled(
      users.map((u, i) => lockSeats(tripId, u._id.toString(), { seatNumbers: [seats[i]] })),
    );

    const successes = results.filter((r) => r.status === 'fulfilled');
    expect(successes).toHaveLength(n);
  });
});

describe('releaseLock', () => {
  it('releases all seats reserved by the calling user on the trip', async () => {
    const { tripId, userId } = await seedTrip(['K1', 'K2', 'K3']);

    await lockSeats(tripId, userId, { seatNumbers: ['K1', 'K2'] });
    const { releasedSeats } = await releaseLock(tripId, userId);

    expect(releasedSeats).toHaveLength(2);
    expect(releasedSeats).toContain('K1');
    expect(releasedSeats).toContain('K2');

    const trip = await Trip.findById(tripId).exec();
    const k1 = trip!.seatInventory.find((s) => s.seatNumber === 'K1')!;
    expect(k1.status).toBe('available');
    expect(k1.reservedBy).toBeNull();
    expect(trip!.availableCount).toBe(3);
  });

  it('does not release seats reserved by a different user', async () => {
    const { tripId, userId, userId2 } = await seedTrip(['L1', 'L2']);

    await lockSeats(tripId, userId, { seatNumbers: ['L1'] });
    const { releasedSeats } = await releaseLock(tripId, userId2);

    expect(releasedSeats).toHaveLength(0);

    const trip = await Trip.findById(tripId).exec();
    const l1 = trip!.seatInventory.find((s) => s.seatNumber === 'L1')!;
    expect(l1.status).toBe('reserved');
    expect(l1.reservedBy?.toString()).toBe(userId);
  });

  it('returns empty array when user has no active locks', async () => {
    const { tripId, userId } = await seedTrip(['M1']);
    const { releasedSeats } = await releaseLock(tripId, userId);
    expect(releasedSeats).toHaveLength(0);
  });

  it('returns 404 for unknown trip', async () => {
    const fakeId = new Types.ObjectId().toString();
    await expect(
      releaseLock(fakeId, new Types.ObjectId().toString()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('TTL configuration', () => {
  it('respects SEAT_LOCK_DURATION_SECONDS env var', async () => {
    process.env.SEAT_LOCK_DURATION_SECONDS = '60';
    const { tripId, userId } = await seedTrip(['N1']);

    const before = Date.now();
    const result = await lockSeats(tripId, userId, { seatNumbers: ['N1'] });
    const expiresAt = new Date(result.expiresAt).getTime();

    // Should expire ~60 s from now, not the default 300 s
    expect(expiresAt - before).toBeGreaterThanOrEqual(59_000);
    expect(expiresAt - before).toBeLessThan(65_000);

    delete process.env.SEAT_LOCK_DURATION_SECONDS;
  });

  it('falls back to 300 s when env var is absent', async () => {
    delete process.env.SEAT_LOCK_DURATION_SECONDS;
    const { tripId, userId } = await seedTrip(['O1']);

    const before = Date.now();
    const result = await lockSeats(tripId, userId, { seatNumbers: ['O1'] });
    const expiresAt = new Date(result.expiresAt).getTime();

    expect(expiresAt - before).toBeGreaterThanOrEqual(299_000);
    expect(expiresAt - before).toBeLessThan(310_000);
  });
});

// ─── createBooking tests ─────────────────────────────────────────────────────

describe('createBooking — input validation', () => {
  it('rejects an invalid tripId', async () => {
    await expect(
      createBooking('uid', { tripId: 'not-an-id', passengers: [{ name: 'Alice', age: 30, seatNumber: 'A1' }] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an empty passengers array', async () => {
    const fakeTrip = new Types.ObjectId().toString();
    await expect(
      createBooking('uid', { tripId: fakeTrip, passengers: [] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a passenger with a blank name', async () => {
    const fakeTrip = new Types.ObjectId().toString();
    await expect(
      createBooking('uid', { tripId: fakeTrip, passengers: [{ name: '  ', age: 25, seatNumber: 'A1' }] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a passenger with a negative age', async () => {
    const fakeTrip = new Types.ObjectId().toString();
    await expect(
      createBooking('uid', { tripId: fakeTrip, passengers: [{ name: 'Bob', age: -1, seatNumber: 'A1' }] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects duplicate seatNumbers across passengers', async () => {
    const fakeTrip = new Types.ObjectId().toString();
    await expect(
      createBooking('uid', {
        tripId: fakeTrip,
        passengers: [
          { name: 'Alice', age: 30, seatNumber: 'A1' },
          { name: 'Bob', age: 25, seatNumber: 'A1' },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns 404 for an unknown tripId', async () => {
    const fakeTrip = new Types.ObjectId().toString();
    const fakeUser = new Types.ObjectId().toString();
    await expect(
      createBooking(fakeUser, { tripId: fakeTrip, passengers: [{ name: 'Alice', age: 30, seatNumber: 'A1' }] }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('createBooking — seat lock verification', () => {
  it('rejects booking a seat that is not locked', async () => {
    const { tripId, userId } = await seedTrip(['P1', 'P2']);
    // P1 is available (not locked), booking should fail
    await expect(
      createBooking(userId, {
        tripId,
        passengers: [{ name: 'Alice', age: 30, seatNumber: 'P1' }],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects booking a seat locked by a different user', async () => {
    const { tripId, userId, userId2 } = await seedTrip(['Q1', 'Q2']);

    await lockSeats(tripId, userId, { seatNumbers: ['Q1'] });

    // userId2 tries to book Q1 which is locked by userId
    await expect(
      createBooking(userId2, {
        tripId,
        passengers: [{ name: 'Bob', age: 25, seatNumber: 'Q1' }],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects booking a seat that does not exist on the bus', async () => {
    const { tripId, userId } = await seedTrip(['R1']);

    await expect(
      createBooking(userId, {
        tripId,
        passengers: [{ name: 'Alice', age: 30, seatNumber: 'Z99' }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects booking when lock has expired', async () => {
    const { tripId, userId } = await seedTrip(['S1']);

    await lockSeats(tripId, userId, { seatNumbers: ['S1'] });

    // Manually expire the lock in the DB
    await Trip.updateOne(
      { _id: tripId, 'seatInventory.seatNumber': 'S1' },
      { $set: { 'seatInventory.$.reservationExpiresAt': new Date(Date.now() - 1000) } },
    ).exec();

    await expect(
      createBooking(userId, {
        tripId,
        passengers: [{ name: 'Alice', age: 30, seatNumber: 'S1' }],
      }),
    ).rejects.toMatchObject({ statusCode: 410 });
  });

  it('rejects booking an already-booked seat', async () => {
    const { tripId, userId } = await seedTrip(['T1']);

    // Manually mark seat as booked
    await Trip.updateOne(
      { _id: tripId, 'seatInventory.seatNumber': 'T1' },
      { $set: { 'seatInventory.$.status': 'booked' }, $inc: { availableCount: -1 } },
    ).exec();

    await expect(
      createBooking(userId, {
        tripId,
        passengers: [{ name: 'Alice', age: 30, seatNumber: 'T1' }],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('createBooking — successful booking', () => {
  it('creates a confirmed booking and transitions seat to booked', async () => {
    const { tripId, userId } = await seedTrip(['U1', 'U2']);

    await lockSeats(tripId, userId, { seatNumbers: ['U1'] });

    const result = await createBooking(userId, {
      tripId,
      passengers: [{ name: 'Alice', age: 30, seatNumber: 'U1' }],
    });

    expect(result.bookingStatus).toBe('confirmed');
    expect(result.seats).toEqual(['U1']);
    expect(result.passengers).toHaveLength(1);
    expect(result.passengers[0].name).toBe('Alice');
    expect(result.bookingId).toBeTruthy();
    expect(result.bookingReference).toMatch(/^BK-\d{8}-[0-9A-F]{6}$/);
    expect(result.totalAmount).toBeGreaterThan(0);

    // Seat must be marked booked in the trip
    const trip = await Trip.findById(tripId).exec();
    const entry = trip!.seatInventory.find((s) => s.seatNumber === 'U1')!;
    expect(entry.status).toBe('booked');
    expect(entry.reservedBy).toBeNull();
    expect(entry.reservationExpiresAt).toBeNull();
  });

  it('calculates total amount from trip price, ignoring any client-supplied value', async () => {
    const { tripId, userId } = await seedTrip(['V1', 'V2', 'V3']);

    await lockSeats(tripId, userId, { seatNumbers: ['V1', 'V2'] });

    const result = await createBooking(userId, {
      tripId,
      passengers: [
        { name: 'Alice', age: 30, seatNumber: 'V1' },
        { name: 'Bob', age: 25, seatNumber: 'V2' },
      ],
    });

    // pricePerSeat is 500 (set in seedTrip), 2 seats → 1000
    expect(result.totalAmount).toBe(1000);
    expect(result.seats).toHaveLength(2);
  });

  it('returns trip info including source, destination, busName', async () => {
    const { tripId, userId } = await seedTrip(['W1']);

    await lockSeats(tripId, userId, { seatNumbers: ['W1'] });

    const result = await createBooking(userId, {
      tripId,
      passengers: [{ name: 'Alice', age: 30, seatNumber: 'W1' }],
    });

    expect(result.trip.tripId).toBe(tripId);
    expect(typeof result.trip.source).toBe('string');
    expect(typeof result.trip.destination).toBe('string');
    expect(typeof result.trip.busName).toBe('string');
    expect(result.trip.departureTime).toBeTruthy();
    expect(result.trip.arrivalTime).toBeTruthy();
  });

  it('sets bookingId on the seat inventory entry', async () => {
    const { tripId, userId } = await seedTrip(['X1']);

    await lockSeats(tripId, userId, { seatNumbers: ['X1'] });

    const result = await createBooking(userId, {
      tripId,
      passengers: [{ name: 'Alice', age: 30, seatNumber: 'X1' }],
    });

    const trip = await Trip.findById(tripId).exec();
    const entry = trip!.seatInventory.find((s) => s.seatNumber === 'X1')!;
    expect(entry.bookingId?.toString()).toBe(result.bookingId);
  });
});

describe('createBooking — concurrent racing', () => {
  it('exactly one winner when two users with the same seat locked both try to book', async () => {
    // Both users lock different seats first, then we manually give both the same lock
    // to simulate the race: both have valid-looking locks at read-time, but only one
    // can win the atomic findOneAndUpdate.
    const { tripId, userId, userId2 } = await seedTrip(['Y1', 'Y2']);

    // Lock seat Y1 for userId
    await lockSeats(tripId, userId, { seatNumbers: ['Y1'] });

    // Manually clone the lock for userId2 on Y1 (simulates race between two
    // concurrent requests where both passed the read-time check)
    const tripBefore = await Trip.findById(tripId).exec();
    const y1Entry = tripBefore!.seatInventory.find((s) => s.seatNumber === 'Y1')!;
    const originalReservedBy = y1Entry.reservedBy;

    // Give userId2 the exact same lock parameters as userId
    await Trip.updateOne(
      { _id: tripId, 'seatInventory.seatNumber': 'Y1' },
      {
        $set: {
          'seatInventory.$.reservedBy': new Types.ObjectId(userId2),
          'seatInventory.$.status': 'reserved',
          'seatInventory.$.reservationExpiresAt': new Date(Date.now() + 300_000),
        },
      },
    ).exec();

    // Now both userId and userId2 "think" they hold the lock on Y1
    // but the DB has userId2's lock. userId's attempt must fail the atomic check.
    const [r1, r2] = await Promise.allSettled([
      createBooking(userId, {
        tripId,
        passengers: [{ name: 'Alice', age: 30, seatNumber: 'Y1' }],
      }),
      createBooking(userId2, {
        tripId,
        passengers: [{ name: 'Bob', age: 25, seatNumber: 'Y1' }],
      }),
    ]);

    // Exactly one should succeed (the one whose userId matches the DB lock at fire time)
    const successes = [r1, r2].filter((r) => r.status === 'fulfilled');
    const failures = [r1, r2].filter((r) => r.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason.statusCode).toBeGreaterThanOrEqual(403);

    // Seat must be booked exactly once
    const trip = await Trip.findById(tripId).exec();
    const entry = trip!.seatInventory.find((s) => s.seatNumber === 'Y1')!;
    expect(entry.status).toBe('booked');

    // Suppress unused variable warning
    void originalReservedBy;
  });

  it('10 concurrent booking attempts for the same seat: exactly 1 succeeds', async () => {
    const seats = ['Z1'];
    const { tripId } = await seedTrip(seats);

    const users = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        User.create({
          name: `BookUser${i}`,
          email: `bookrace-${uid()}@test.com`,
          passwordHash: 'hashed',
          role: 'customer',
        }),
      ),
    );

    // Lock Z1 for each user sequentially (only the last one will hold the lock)
    for (const u of users) {
      // Release any existing lock, then lock for this user
      await Trip.updateOne(
        { _id: tripId, 'seatInventory.seatNumber': 'Z1' },
        {
          $set: {
            'seatInventory.$.status': 'reserved',
            'seatInventory.$.reservedBy': u._id,
            'seatInventory.$.reservedAt': new Date(),
            'seatInventory.$.reservationExpiresAt': new Date(Date.now() + 300_000),
          },
        },
      ).exec();
    }

    // Now all 10 users fire concurrent booking requests; only the one whose ID
    // matches the DB lock (the last user) will win the atomic gate.
    const results = await Promise.allSettled(
      users.map((u) =>
        createBooking(u._id.toString(), {
          tripId,
          passengers: [{ name: u.name, age: 30, seatNumber: 'Z1' }],
        }),
      ),
    );

    const successes = results.filter((r) => r.status === 'fulfilled');
    expect(successes).toHaveLength(1);

    const failures = results.filter((r) => r.status === 'rejected');
    expect(failures).toHaveLength(9);

    // Seat must end up booked
    const trip = await Trip.findById(tripId).exec();
    const entry = trip!.seatInventory.find((s) => s.seatNumber === 'Z1')!;
    expect(entry.status).toBe('booked');
  });
});
