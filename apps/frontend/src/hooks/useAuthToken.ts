import { useAuth } from "react-oidc-context";

/**
 * Single source of truth for the bearer access token.
 *
 * Hooks that fetch the API previously each pulled the token via
 * `useAuth()` and reached into `auth.user?.access_token`, repeating the
 * null-safe access pattern in 10+ places. Now they call this hook,
 * which lets us swap the underlying auth provider without touching
 * every consumer (and gives a single grep target if we need to audit
 * who reads the token).
 */
export function useAuthToken(): string | undefined {
  const auth = useAuth();
  return auth.user?.access_token;
}
