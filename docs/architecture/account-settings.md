# Account Settings

`/account/*` is a tabbed page mirroring the Sources shell pattern. User
profile, device registry, default preferences, third-party integrations,
and a billing placeholder all live here.

## Routes

| Path                    | Tab           | Purpose                                              |
| ----------------------- | ------------- | ---------------------------------------------------- |
| `/account`              | Profile       | Name, email, session expiry, "sign out all devices", danger zone |
| `/account/devices`      | Devices       | Per-device list; rename, forget; current device chip |
| `/account/defaults`     | Defaults      | User-level Leiden knobs + layout + theme + telemetry |
| `/account/integrations` | Integrations  | GitHub PAT validator, Keycloak account console link  |
| `/account/billing`      | Billing       | Placeholder shell, live `sources/snapshots/bytes` counts |

## Backend endpoints (new in P4)

- `POST /api/users/me/sessions/revoke-all` — end every Keycloak session for
  the current user via the admin API. 501 if `KEYCLOAK_ADMIN_CLIENT_SECRET`
  is empty.
- `POST /api/integrations/github/validate` — proxy to
  `GET https://api.github.com/user` so the frontend can check that a pasted
  PAT still works without persisting it server-side.
- `GET /api/users/me/usage` — aggregator over `sources` + `sync_runs.stats`
  returning `{sources, snapshots, embedding_bytes, graph_bytes}`.
- `POST /api/users/me/deletion-request` — stub; returns 501 until real
  deletion flow lands.
- Device rename/forget (`PUT`/`DELETE /api/users/me/devices/{device_id}`)
  already existed pre-P4; P4 only adds a UI for them.

## Preferences flow

`useApplyTheme` mirrors `prefs.theme` onto `<html class="theme-light|
theme-dark">`. `"system"` resolves via `prefers-color-scheme` and
re-applies on OS change.

`usePreferences` hydrates the prefs store from
`/api/users/me/preferences` once per mount and subscribes to store changes
to PUT server-side. Failures log but do not block the UI.

## Theme application

Effect runs at `App.tsx` top-level so every route has the correct `<html>`
class before the first paint. Dark/light token definitions live in
`theme.css`; `globals.css` references them without knowing the current
theme.

## Env configuration

```
# Service-account wiring for POST /api/users/me/sessions/revoke-all
KEYCLOAK_ADMIN_URL=http://keycloak:8080/admin/realms/substrate
KEYCLOAK_TOKEN_URL=http://keycloak:8080/realms/substrate/protocol/openid-connect/token
KEYCLOAK_ADMIN_CLIENT_ID=substrate-admin
KEYCLOAK_ADMIN_CLIENT_SECRET=           # empty => /revoke-all returns 501
GITHUB_VALIDATE_TIMEOUT_S=10            # GitHub /user probe timeout
```
