import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "react-oidc-context";

import { apiFetch } from "@/lib/api";

export interface UserDevice {
  device_id: string;
  label: string;
  last_loaded_sync_ids: string[];
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

export interface UserProfile {
  user_sub: string;
  preferred_username: string;
  email: string;
  display_name: string;
  role: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

export interface UserMeResponse {
  profile: UserProfile;
  devices: UserDevice[];
}

export function useCurrentUser() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const qc = useQueryClient();

  const me = useQuery({
    queryKey: ["users", "me"],
    enabled: !!token,
    queryFn: () => apiFetch<UserMeResponse>("/api/users/me", token),
    staleTime: 60_000,
  });

  const patchMe = useMutation({
    mutationFn: (body: { display_name?: string; preferred_username?: string; email?: string }) =>
      apiFetch<UserProfile>("/api/users/me", token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users", "me"] }),
  });

  const upsertDevice = useMutation({
    mutationFn: (args: { deviceId: string; label?: string; last_loaded_sync_ids: string[] }) =>
      apiFetch<UserDevice>(`/api/users/me/devices/${encodeURIComponent(args.deviceId)}`, token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: args.label,
          last_loaded_sync_ids: args.last_loaded_sync_ids,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users", "me"] }),
  });

  return {
    me: me.data,
    meQuery: me,
    patchMe: patchMe.mutateAsync,
    patchMeState: patchMe,
    upsertDevice: upsertDevice.mutateAsync,
    upsertDeviceState: upsertDevice,
  };
}

