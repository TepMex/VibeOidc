# VibeOIDC

Starter structure for a local OIDC test provider (Keycloak-compatible mindset) using Node.js, TypeScript, and Fastify.

## Prerequisites

- Node.js `22.14.0`
- npm `>=10`

This project supports both:

- `asdf` (macOS / Linux) via `.tool-versions`
- `fnm` (Windows-friendly) via `.node-version` (and `.nvmrc` fallback)

## Setup

1. Install dependencies:
   - `npm install`
2. Create local config files:
   - `cp .env.example .env`
   - `cp users.example.json users.json`
3. Start in dev mode:
   - `npm run dev`

## Node version manager usage

### macOS with asdf

1. Ensure plugin exists:
   - `asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git`
2. Install and activate:
   - `asdf install`
   - `asdf local nodejs 22.14.0`
3. Verify:
   - `node -v`

### Windows with fnm (PowerShell)

1. Install and use version from project:
   - `fnm install --use 22.14.0`
2. Verify:
   - `node -v`

> Tip: `fnm` can auto-switch when entering directories if shell integration is enabled.

## Current endpoints

- Health check endpoint: `/health`
- OIDC discovery: `/.well-known/openid-configuration`
- Authorization endpoint: `/protocol/openid-connect/auth`
- Token endpoint: `/protocol/openid-connect/token`
- JWKS endpoint: `/protocol/openid-connect/certs`
- Interaction login page: `/login/:uid` (user picker from `users.json`)
- JWT access tokens and Keycloak-like role claims (`realm_access`, `resource_access`)

## Quick local auth-code test

Use these values (or your `.env` overrides):

- `client_id=local-client`
- `client_secret=local-secret`
- `redirect_uri=http://127.0.0.1:4100/ui/callback`
- `scope=openid profile email roles`

Sample authorize URL:

`http://127.0.0.1:4100/protocol/openid-connect/auth?client_id=local-client&redirect_uri=http://127.0.0.1:4100/ui/callback&response_type=code&scope=openid%20profile%20email%20roles`

When redirected to `/login/:uid`, pick a user, then exchange `code` at `/protocol/openid-connect/token`.

## Built-in UI

- Open `http://127.0.0.1:4100/ui`
- Click a user button to start authorize flow (this sets selected user in cookie)
- After callback, click "Issue token for selected user"
- `/ui/token` ignores `client_id`, `client_secret`, and `grant_type` and always returns tokens for selected UI user

## Backend config compatibility

If your backend expects `Issuer` and raw `JwtPublicKey` fields:

- Issuer: `http://127.0.0.1:4100` (or your `OIDC_ISSUER`)
- JwtPublicKey endpoint: `/protocol/openid-connect/jwt-public-key`
- Helper JSON config: `/protocol/openid-connect/backend-config`
- JWKS endpoint (standard): `/protocol/openid-connect/certs`
