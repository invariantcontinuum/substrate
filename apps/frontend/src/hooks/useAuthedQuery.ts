import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "./useAuthToken";

/**
 * Thin wrapper around `useQuery` that fetches a JSON GET via the shared
 * `apiFetch` + `useAuthToken` pipeline.
 *
 * Most read hooks in this app share the exact same shape:
 *   const auth = useAuth();
 *   const token = auth.user?.access_token;
 *   return useQuery({
 *     queryKey: [...],
 *     queryFn: () => apiFetch<T>("/api/...", token),
 *     enabled: !!token,
 *   });
 *
 * `useAuthedQuery` collapses that boilerplate so the hook body becomes
 * one line per query. Callers can still pass `staleTime`,
 * `refetchOnWindowFocus`, `gcTime`, etc. via the optional `options`
 * argument — those are forwarded straight to TanStack Query.
 *
 * Auth is enforced by default: when no bearer token is available the
 * query is disabled and never hits the network. Consumers that want a
 * different `enabled` predicate can supply one in `options`; it's AND-ed
 * with `!!token` so an unauthenticated render never accidentally fires.
 */
export function useAuthedQuery<T>(
  queryKey: readonly unknown[],
  path: string,
  options?: Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, "queryKey" | "queryFn" | "enabled"> & {
    enabled?: boolean;
  },
): UseQueryResult<T, Error> {
  const token = useAuthToken();
  const callerEnabled = options?.enabled ?? true;
  return useQuery<T, Error, T, readonly unknown[]>({
    ...options,
    queryKey,
    queryFn: () => apiFetch<T>(path, token),
    enabled: !!token && callerEnabled,
  });
}
