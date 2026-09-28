# Backend

Express 5 + Mongoose 9 REST API for the red_colne bus booking platform.

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Express 5
- **Language**: TypeScript (migrating — new files must be `.ts`)
- **Database**: MongoDB via Mongoose 9
- **Auth**: JWT (`jsonwebtoken`) + password hashing (`bcrypt`)
- **Test runner**: Vitest
- **Dev server**: nodemon + tsx (no compile step)

## Setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev         # nodemon on http://localhost:5000
```

### Environment Variables

Create `backend/.env`:

```
PORT=5000
MONGO_URI=mongodb://localhost:27017/red_colne
JWT_SECRET=<any-long-random-string>
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start with nodemon (hot-reload, no compile) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output (`dist/server.js`) |
| `npm run typecheck` | Type-check without emitting |
| `npm run seed` | Seed DB with sample routes, buses, trips, users |
| `npm test` | Run Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |

## Source Layout

```
src/
├── index.ts               Vercel serverless entry (exports Express handler)
├── server.ts              HTTP server entry (listens on PORT, runs seat sweep)
├── app.ts                 Express app: middleware stack + route mounting
│
├── config/
│   └── database.ts        connectDB() / disconnectDB()
│
├── models/
│   ├── User.model.ts
│   ├── Bus.model.ts
│   ├── Route.model.ts
│   ├── Trip.model.ts
│   └── Booking.model.ts
│
├── controllers/           HTTP layer — parse req, call service, send res
│   ├── auth.controller.ts
│   ├── trip.controller.ts
│   ├── seat.controller.ts
│   ├── booking.controller.ts
│   ├── health.controller.ts
│   └── admin/
│       ├── trip.admin.controller.ts
│       ├── bus.admin.controller.ts
│       ├── route.admin.controller.ts
│       └── booking.admin.controller.ts
│
├── services/              Business logic — no HTTP context
│   ├── auth.service.ts
│   ├── trip.service.ts
│   ├── seat.service.ts
│   ├── booking.service.ts
│   └── admin/
│       ├── trip.admin.service.ts
│       ├── bus.admin.service.ts
│       ├── route.admin.service.ts
│       └── booking.admin.service.ts
│
├── middleware/
│   ├── authenticate.ts    Verifies Bearer JWT; sets req.user
│   ├── authorize.ts       Role-based access control
│   ├── errorHandler.ts    Central error handler (500 fallback)
│   └── notFound.ts        404 handler for unmatched routes
│
├── routes/
│   ├── health.routes.ts
│   ├── auth.routes.ts
│   ├── trip.routes.ts
│   ├── seat.routes.ts
│   ├── booking.routes.ts
│   ├── cities.routes.ts
│   └── admin/
│       └── index.routes.ts
│
├── types/                 TypeScript interfaces and DTOs
│   ├── user.types.ts
│   ├── bus.types.ts
│   ├── trip.types.ts
│   ├── booking.types.ts
│   ├── auth.types.ts
│   ├── trip-search.types.ts
│   ├── seat-reservation.types.ts
│   └── admin.types.ts
│
└── scripts/
    ├── seed.ts            DB seed script
    └── create-superuser.ts  CLI to create admin user
```

## API Endpoints

See [docs/api-reference.md](../docs/api-reference.md) for full details.

### Public

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Login, receive JWT |
| `GET` | `/api/trips/search` | Search trips by from/to/date |
| `GET` | `/api/cities` | List all route cities |
| `GET` | `/api/trips/:tripId/seats` | Get seat availability |

### Authenticated (Bearer JWT)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auth/me` | Get current user |
| `POST` | `/api/trips/:tripId/seats/lock` | Lock seats (10-min hold) |
| `DELETE` | `/api/trips/:tripId/seats/lock` | Release seat lock |
| `POST` | `/api/bookings` | Create booking |
| `GET` | `/api/bookings` | List my bookings |
| `GET` | `/api/bookings/:bookingId` | Get booking detail |

### Admin / Operator

All under `/api/admin/`, require `admin` or `operator` role.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/dashboard` | Stats (counts + revenue) |
| `GET/POST` | `/api/admin/trips` | List / create trips |
| `PATCH/DELETE` | `/api/admin/trips/:id` | Update / delete trip |
| `GET/POST` | `/api/admin/buses` | List / create buses |
| `PATCH/DELETE` | `/api/admin/buses/:id` | Update / delete bus |
| `GET/POST` | `/api/admin/routes` | List / create routes |
| `DELETE` | `/api/admin/routes/:id` | Delete route |
| `GET` | `/api/admin/bookings` | List all bookings |
| `PATCH` | `/api/admin/bookings/:id/cancel` | Cancel booking |

## Architecture

The codebase follows a strict three-layer pattern:

```
Route → Controller → Service → Model
```

- **Routes** only map HTTP verbs + paths to controller functions.
- **Controllers** extract data from `req`, call the service, and send the `res`. No business logic lives here.
- **Services** contain all business logic and only talk to Mongoose models. They are HTTP-agnostic, which makes them easy to test.
- **Models** define schemas and enforce data constraints at the database level.

## Authentication

1. Client POSTs credentials to `/api/auth/login`.
2. Server verifies the password with `bcrypt.compare`.
3. On success, signs a JWT (`{ userId, role }`) and returns it.
4. Client sends `Authorization: Bearer <token>` on subsequent requests.
5. `authenticate` middleware verifies the token and attaches `req.user`.
6. `authorize(...roles)` middleware checks `req.user.role` for protected resources.

## Seat Locking

Seat locks are stored on each `Trip` document's `seatInventory` array. Each entry has:

- `status` — `available | locked | booked`
- `lockedBy` — user ObjectId
- `lockExpiresAt` — timestamp

`server.ts` runs `sweepExpiredLocks()` on an interval to release expired locks. The controller also lazily expires locks when `getSeats` is called.

See [docs/seat-reservation.md](../docs/seat-reservation.md) for full details.

## TypeScript Migration

The backend is migrating from JavaScript to TypeScript. Progress:

- All new files must be written in `.ts`.
- The `types/` directory contains shared interfaces for all layers.
- Run `npm run typecheck` to verify type correctness without building.
- Compiled output goes to `dist/` — do not commit it.

See `backend/CLAUDE.md` for migration conventions.

## Testing

```bash
npm test              # single run
npm run test:watch    # watch mode
```

Tests live alongside their subject file (e.g., `seat.service.concurrent.test.ts`). Use Vitest's `vi.mock` for Mongoose models. Focus tests on the service layer where business logic lives.
