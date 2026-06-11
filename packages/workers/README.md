# @waline/workers

Cloudflare Workers deployment adapter for the [Waline](https://waline.js.org) comment system.

## Features

- Built on [Hono](https://hono.dev) framework — optimized for Cloudflare Workers
- Uses [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite-compatible) for storage
- Reuses Waline's existing storage adapter interface and API structure
- Supports the full Waline REST API (`/api/comment`, `/api/user`, `/api/token`, `/api/article`)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure `wrangler.jsonc`

Edit `wrangler.jsonc` to set your D1 database ID and environment variables:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "waline",
      "database_id": "your-d1-database-id"
    }
  ],
  "vars": {
    "JWT_TOKEN": "your-secret-jwt-key"
  }
}
```

### 3. Create the D1 database

```bash
# Create D1 database
npx wrangler d1 create waline

# Apply schema (local)
npx wrangler d1 execute waline --local --file=schema.sql

# Apply schema (remote)
npx wrangler d1 execute waline --file=schema.sql
```

### 4. Deploy

```bash
npm run deploy
```

## Development

```bash
# Start local dev server (uses Miniflare with local D1)
npm run dev

# Run tests
npm test

# Start a local test server (Node.js, no wrangler required)
npm run test:server
```

## Environment Variables

| Variable            | Description                                | Required |
|---------------------|--------------------------------------------|----------|
| `JWT_TOKEN`         | Secret key for JWT authentication          | Yes      |
| `SITE_NAME`         | Site name for notifications                | No       |
| `SITE_URL`          | Site URL                                   | No       |
| `SECURE_DOMAINS`    | Comma-separated list of allowed domains    | No       |
| `FORBIDDEN_WORDS`   | Comma-separated list of forbidden words    | No       |
| `DISABLE_USERAGENT` | Disable user agent display (`true`/`false`)| No       |
| `DISABLE_REGION`    | Disable region display (`true`/`false`)    | No       |
| `AVATAR_PROXY`      | Avatar proxy URL                           | No       |
| `COMMENT_AUDIT`     | Enable comment audit mode (`true`/`false`) | No       |

## API

The Workers adapter exposes the same REST API as the main `@waline/vercel` server:

- `GET/POST /api/comment` — Comment list and creation
- `GET/PUT/DELETE /api/comment/:id` — Single comment operations
- `GET/POST/DELETE /api/token` — Authentication (login/logout)
- `GET/POST/PUT/DELETE /api/user` — User management
- `GET/POST /api/article` — Article view/like counters

## Architecture

```
src/
├── index.js          # CF Workers entry point (exports default Hono app)
├── app.js            # Hono app factory (used for both CF Workers and tests)
├── config.js         # Configuration from env bindings
├── auth.js           # JWT auth utilities
├── markdown.js       # Markdown parsing + XSS sanitization
├── avatar.js         # Avatar URL generation
├── storage/
│   └── d1.js         # Cloudflare D1 storage adapter
└── routes/
    ├── comment.js    # /api/comment routes
    ├── token.js      # /api/token routes
    ├── user.js       # /api/user routes
    └── article.js    # /api/article routes
```

The D1 storage adapter implements the same interface as other Waline adapters (MySQL, SQLite, PostgreSQL, etc.), making it fully compatible with the existing Waline ecosystem.
