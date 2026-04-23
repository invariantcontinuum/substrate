const DEVICE_ID_KEY = "substrate-device-id";
const SYNC_CONTEXT_PREFIX = "substrate-sync-set";

export interface PersistedSyncContext {
  syncIds: string[];
  hasInitialized: boolean;
  updatedAt: string;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function fallbackDeviceId(): string {
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateDeviceId(): string {
  if (!canUseStorage()) return "device-ssr";
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : fallbackDeviceId();
  localStorage.setItem(DEVICE_ID_KEY, generated);
  return generated;
}

export function syncContextKey(userSub: string, deviceId: string): string {
  return `${SYNC_CONTEXT_PREFIX}:${userSub}:${deviceId}`;
}

export function loadSyncContext(userSub: string, deviceId: string): PersistedSyncContext {
  if (!canUseStorage()) {
    return { syncIds: [], hasInitialized: false, updatedAt: new Date(0).toISOString() };
  }
  try {
    const raw = localStorage.getItem(syncContextKey(userSub, deviceId));
    if (!raw) {
      return { syncIds: [], hasInitialized: false, updatedAt: new Date(0).toISOString() };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedSyncContext>;
    const syncIds = Array.isArray(parsed.syncIds)
      ? parsed.syncIds.filter((v): v is string => typeof v === "string")
      : [];
    return {
      syncIds,
      hasInitialized: Boolean(parsed.hasInitialized),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return { syncIds: [], hasInitialized: false, updatedAt: new Date(0).toISOString() };
  }
}

export function saveSyncContext(
  userSub: string,
  deviceId: string,
  context: { syncIds: string[]; hasInitialized: boolean },
): void {
  if (!canUseStorage()) return;
  const payload: PersistedSyncContext = {
    syncIds: context.syncIds,
    hasInitialized: context.hasInitialized,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(syncContextKey(userSub, deviceId), JSON.stringify(payload));
}

