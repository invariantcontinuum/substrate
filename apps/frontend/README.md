# Substrate Frontend

React 19 + Vite + TypeScript single-page application for the Substrate governance platform.

## Role In The Stack

The frontend is the authenticated user interface for exploring the graph, managing syncs, and working with sources and schedules.

- Serves the dashboard on `http://localhost:3535` in the full Compose stack
- Uses Keycloak and OIDC for authentication
- Talks to the backend through the gateway, not directly to internal services
- Consumes shared browser utilities and schemas from `packages/substrate-web-common`

## Runtime Model

The browser only talks to the frontend host.

- In local Vite development, the dev server proxies `/api`, `/jobs`, `/ingest`, and `/auth` to `http://localhost:8180`
- In the containerized stack, frontend nginx serves the built SPA and forwards backend traffic to the gateway
- Realtime updates use server-sent events through the gateway endpoint `/api/events`

## Authentication

OIDC configuration is built from Vite env vars in [`src/lib/auth.ts`](/home/dany/Desktop/substrate/apps/frontend/src/lib/auth.ts:1).

Required build-time variables:

- `VITE_KEYCLOAK_URL`
- `VITE_KEYCLOAK_REALM`
- `VITE_KEYCLOAK_CLIENT_ID`

Optional frontend variables:

- `VITE_API_URL` to override the default relative API base
- `VITE_LOG_LEVEL` to control client logging verbosity

Root env templates live at:

- [`../../.env.local.example`](/home/dany/Desktop/substrate/.env.local.example:1)
- [`../../.env.prod.example`](/home/dany/Desktop/substrate/.env.prod.example:1)

## Local Development

From the repository root, use the full stack when you want the real application environment:

```bash
cd /home/dany/Desktop/substrate
# Start the host LLM stack (embeddings on :8101, dense on :8102) before bringing up substrate.
make up
```

Then open `http://localhost:3535`.

If you only need the frontend dev server with HMR:

```bash
cd /home/dany/Desktop/substrate/apps/frontend
pnpm install
pnpm dev
```

That starts Vite on `http://localhost:3000`. Backend requests are proxied to the gateway on `http://localhost:8180`, so the gateway, auth, and dependent services still need to be available.

## Scripts

- `pnpm dev` runs the Vite dev server on port `3000`
- `pnpm build` runs TypeScript project builds and produces the production bundle
- `pnpm lint` runs ESLint for the frontend package
- `pnpm preview` serves the built output locally

## Testing

The frontend uses Vitest with `jsdom` and Testing Library.

Frontend-focused tests live alongside the source files, for example under `src/hooks`, `src/lib`, and `src/stores`.

From `apps/frontend`:

```bash
pnpm exec vitest run
```

From the repository root, the standard validation path is:

```bash
make lint
make test
make test-e2e
```

## Key Files

- [`src/main.tsx`](/home/dany/Desktop/substrate/apps/frontend/src/main.tsx:1) wires React, routing, auth, and React Query
- [`src/App.tsx`](/home/dany/Desktop/substrate/apps/frontend/src/App.tsx:1) defines route structure and the auth gate
- [`src/lib/auth.ts`](/home/dany/Desktop/substrate/apps/frontend/src/lib/auth.ts:1) builds the OIDC configuration
- [`src/lib/api.ts`](/home/dany/Desktop/substrate/apps/frontend/src/lib/api.ts:1) centralizes API fetch behavior
- [`vite.config.ts`](/home/dany/Desktop/substrate/apps/frontend/vite.config.ts:1) defines path aliases, dev-server port, proxies, and Vitest config
