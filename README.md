# SAZU Marketplace: client and server

**Buy. Sell. Connect. On Campus.** A campus marketplace for students of Sa'adu Zungur University, Gadau. Discovery and seller-buyer messaging only. **There are no online payments, by design.**

| Folder | What it is | Tech |
|---|---|---|
| `client/` | The website (was `apps/web`) | Next.js 15, React 19, TypeScript, Tailwind CSS |
| `server/` | The REST + WebSocket API (was `apps/api`) | NestJS 10, TypeScript, Socket.IO, plain PostgreSQL |
| `docs/` | Architecture, auth, catalog, seller, buyer, messaging and admin notes | |
| `docker-compose.yml` | A local PostgreSQL for development | |

The two folders are independent: each has its own `package.json`, so install and run them separately.

## Run it locally

You need Node.js 20+ and PostgreSQL 14+ (or Docker).

```bash
# 1. Database (Docker), or point DATABASE_URL at any PostgreSQL you already have
docker compose up -d postgres

# 2. Server
cd server
cp .env.example .env          # then set JWT_ACCESS_SECRET (openssl rand -base64 48)
npm install
npm run migrate:up            # creates the tables
npm run start:dev             # http://localhost:4000   (API docs: /api/docs)

# 3. Client (new terminal)
cd client
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:3000
```

Without SMTP configured (development only), verification codes and password-reset links are **printed in the server's log**.

To send them through Resend, set these in `server/.env` (use a sender address on a domain verified in Resend):

```dotenv
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASSWORD=<your Resend API key>
MAIL_FROM="SAZU Marketplace <no-reply@your-verified-domain.com>"
```

Keep the API key private. Restart the API after changing `.env`; a missing SMTP host in development means messages are logged rather than emailed.

Create your first administrator (there is intentionally no web page for this):

```bash
cd server && npm run build
npm run admin:grant -- you@example.com admin        # then open http://localhost:3000/admin
npm run admin:grant -- you@example.com admin --set-password  # securely prompt to set/reset the password
```

On Windows PowerShell, you can instead set a password securely and grant admin access to an existing account:

```powershell
$env:ADMIN_EMAIL = "you@example.com"
$securePassword = Read-Host "Enter a new password (at least 12 characters)" -AsSecureString
$passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
    npm run build
    if ($LASTEXITCODE -eq 0) { npm run admin:create }
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
    Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:ADMIN_EMAIL -ErrorAction SilentlyContinue
}
```

The account must already exist; register it first. This operation updates its password, grants the `admin` role, clears login lockout, and revokes existing sessions.

Optional sample data (development only, every item labelled `[DEV SAMPLE]`): `cd server && npm run build && npm run seed:dev` (add `-- --remove` to delete).

## Quality commands

```bash
# in server/ and in client/
npm run lint && npm run typecheck && npm run test && npm run build
```

Server tests run against a **real PostgreSQL** and need a separate empty database: `CREATE DATABASE sazu_test OWNER sazu;` (or set `TEST_DATABASE_URL`).

Real-browser checks in the client (headless Chromium comes with the dev dependencies), with both apps running: `npm run qa:acceptance` (the 13-step scenario from the brief) and `npm run qa:audit` (responsive and accessibility audit of every screen). Set `API_LOG` to the server's log file so the scripts can read development emails.

## Settings that must match between the two folders

| Server (`server/.env`) | Client (`client/.env.local`) |
|---|---|
| `CORS_ORIGINS` must include the client's address | `NEXT_PUBLIC_API_URL` points at the server's `/api/v1` |
| `INTERNAL_API_KEY` (24+ chars) | `API_INTERNAL_KEY` (same value; server-only, never `NEXT_PUBLIC_`) |
| `APP_WEB_URL` = the client's public address (used in emails) | `NEXT_PUBLIC_SITE_URL` = the client's public address |

The refresh-token cookie works when the client and server share a site (for example `app.example.com` and `api.example.com`) with `COOKIE_SAMESITE=lax`.

## About the docs

The files in `docs/` were written for the original single-repo layout, so a command such as `npm run migrate:up -w apps/api` there means `cd server && npm run migrate:up`, and `apps/web` means `client/`.
