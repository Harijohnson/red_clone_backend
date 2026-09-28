# Backend

Express 5 + Mongoose 9 REST API. Currently plain JavaScript — migration to TypeScript is in progress.

## Stack

- **Runtime**: Node.js
- **Framework**: Express 5
- **Database**: MongoDB via Mongoose 9
- **Config**: dotenv
- **Dev server**: nodemon

## Scripts

```bash
npm run dev     # nodemon src/server.js — hot reload
npm start       # node src/server.js — production
```

## Source Layout

```
src/
├── server.js          # Entry: loads env, connects DB, starts Express
├── app.js             # Express app setup, global middleware, health route
├── config/
│   └── db.js          # Mongoose connection
├── controllers/       # Route handler functions
├── middleware/        # Express middleware (auth, validation, errors)
├── models/            # Mongoose schemas/models
├── routes/            # Express routers
├── services/          # Business logic, external calls
└── utils/             # Shared helpers
```

## Environment Variables

| Variable    | Default                                | Notes                    |
|-------------|----------------------------------------|--------------------------|
| `PORT`      | `5000`                                 |                          |
| `MONGO_URI` | `mongodb://localhost:27017/red_colne`  |                          |
| `JWT_SECRET`| —                                      | Required for auth routes |

## TypeScript Migration

The goal is full TypeScript. Steps when migrating a file:

1. Install dev deps (once): `npm i -D typescript ts-node @types/node @types/express @types/mongoose`
2. Add `tsconfig.json` at `backend/` root (target `ES2022`, module `commonjs`, `outDir: dist`, `rootDir: src`)
3. Rename `.js` → `.ts`, replace `require`/`module.exports` with ES module `import`/`export`
4. Add types to Mongoose schemas with `Document` interfaces

Until fully migrated, keep existing `.js` files working — don't break the running app.

## Conventions

- Controllers only handle HTTP: parse request, call service, send response
- Business logic lives in `services/`, not controllers
- All async handlers must propagate errors (use `next(err)` or async error middleware)
- Validate at the route boundary — don't trust `req.body` inside services
- Never log secrets or full error stacks to stdout in production
