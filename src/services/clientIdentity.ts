export const RM_CLIENT_ID_KEY = "rm_client_id";

let cachedClientId: string | null = null;

function generateClientId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `rm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getClientId(): string {
  if (cachedClientId) {
    return cachedClientId;
  }

  try {
    const existing =
      typeof localStorage !== "undefined" ? localStorage.getItem(RM_CLIENT_ID_KEY) : null;
    if (existing && existing.trim()) {
      cachedClientId = existing;
      return cachedClientId;
    }
  } catch {
    // localStorage can be unavailable in restricted environments
  }

  const created = generateClientId();
  cachedClientId = created;

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(RM_CLIENT_ID_KEY, created);
    }
  } catch {
    // best effort only
  }

  return created;
}
