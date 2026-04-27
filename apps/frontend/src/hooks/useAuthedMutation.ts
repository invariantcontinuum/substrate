import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "./useAuthToken";

interface AuthedMutationParams<TVars> {
  /** Build the request path from the variables. */
  path: (vars: TVars) => string;
  /** HTTP method. Defaults to POST since mutations rarely GET. */
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  /** Optional body builder. Return value is JSON.stringify-d. */
  body?: (vars: TVars) => unknown;
  /** Query keys to invalidate on success — recursive matching. */
  invalidateKeys?: readonly (readonly unknown[])[];
}

/**
 * Wrapper around `useMutation` that wires the bearer token, content
 * type, and the most common post-success behaviour (cache
 * invalidation) so mutation hooks drop to a single declaration.
 *
 * Without this helper, every mutation re-implements:
 *   - `useAuth` + token extraction
 *   - the `apiFetch(path, token, { method, body, headers: {...} })` call
 *   - `useQueryClient` + `qc.invalidateQueries({ queryKey: [...] })` on success
 *
 * Consumers can still override `onSuccess`/`onError` etc. via `mutationOptions`.
 * `invalidateKeys` runs BEFORE any caller-supplied `onSuccess` so the
 * cache is already invalidated by the time the caller's hook runs.
 */
export function useAuthedMutation<TData, TVars>(
  params: AuthedMutationParams<TVars>,
  mutationOptions?: Omit<
    UseMutationOptions<TData, Error, TVars>,
    "mutationFn"
  >,
): UseMutationResult<TData, Error, TVars> {
  const token = useAuthToken();
  const qc = useQueryClient();
  const { path, method = "POST", body, invalidateKeys } = params;
  return useMutation<TData, Error, TVars>({
    ...mutationOptions,
    mutationFn: async (vars: TVars) => {
      const init: RequestInit = { method };
      if (body !== undefined) init.body = JSON.stringify(body(vars));
      return apiFetch<TData>(path(vars), token, init);
    },
    onSuccess: ((...args: unknown[]) => {
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          qc.invalidateQueries({ queryKey: key });
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
      (mutationOptions?.onSuccess as any)?.(...args);
    }) as UseMutationOptions<TData, Error, TVars>["onSuccess"],
  });
}
