import { useAuthedQuery } from "@/hooks/useAuthedQuery";

/**
 * Fetches the list of federated IDP provider aliases the current user
 * signed in through (e.g. ``["github"]``). The backend returns an empty
 * list for native Keycloak users and degrades silently (also empty)
 * when the gateway has no service-account secret — the Profile tab
 * uses the result purely to decide whether to render the "Signed in via"
 * chip set.
 */
export function useProfileIdps(): {
  idps: string[];
  isLoading: boolean;
} {
  const q = useAuthedQuery<{ providers: string[] }>(
    ["profile-idps"],
    "/api/profile/idps",
  );
  return {
    idps: q.data?.providers ?? [],
    isLoading: q.isLoading,
  };
}
