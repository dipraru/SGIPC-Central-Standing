# SGIPC Standings

SGIPC standings website for Codeforces practice problems with public standings and admin-only handle management.

## Features
- Public standings page with Elo-based rating from solved practice problems
- Admin login at `/admin` (no login required for public page)
- Admin can add, update, delete Codeforces handles

## Setup
1. Copy `server/.env.example` to `server/.env`.
2. Update `MONGODB_URI` with your MongoDB connection string.
3. Update `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `JWT_SECRET`.

## Run (development)
```bash
npm install
npm --prefix server install
npm --prefix client install
npm run dev
```

## Server endpoints
- `GET /api/standings`
- `POST /api/admin/login`
- `GET /api/admin/handles`
- `POST /api/admin/handles`
- `PUT /api/admin/handles/:id`
- `DELETE /api/admin/handles/:id`
