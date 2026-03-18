# Rate limiting

Centralised rate limit config, store, and middlewares.

## Config (env)

| Env | Default | Description |
|-----|--------|-------------|
| `RATE_LIMIT_GLOBAL_LIMIT` | 150 | Max requests per IP per window (global API). |
| `RATE_LIMIT_GLOBAL_WINDOW_MS` | 60000 | Global window in ms (1 min). |
| `RATE_LIMIT_AUTH_LIMIT` | 10 | Max attempts per IP for register/OTP per window. |
| `RATE_LIMIT_AUTH_WINDOW_MS` | 600000 | Auth window in ms (10 min). |
| `RATE_LIMIT_LOGIN_LIMIT` | 5 | Max failed login attempts per IP+email per window. |
| `REDIS_URL` | — | If set, use Redis for store (see store.ts). |

## Store

- **Default:** in-memory (`MemoryStore`). One instance per limiter (required by express-rate-limit).
- **Multi-instance:** set `REDIS_URL` and implement Redis in `store.ts` (e.g. `rate-limit-redis`) so all server instances share the same counters.

## Usage

- **Global:** applied in `server.ts` to all routes. Skips `/api/health` and `/billing/events`.
- **Login:** `loginLimiter` on `POST /auth/login` (failed attempts only).
- **Auth strict:** `authStrictLimiter` on `POST /auth/register` and `POST /auth/otp`.
