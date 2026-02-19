const CACHE_PREFIX = "geo:";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface GeocodeCacheItem {
  label: string;
  timestamp: number;
}

function toCacheKey(lat: number, lon: number): string {
  return `${CACHE_PREFIX}${lat.toFixed(3)}:${lon.toFixed(3)}`;
}

function readCache(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as GeocodeCacheItem;
    if (!parsed || typeof parsed.label !== "string" || typeof parsed.timestamp !== "number") {
      localStorage.removeItem(key);
      return null;
    }

    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed.label;
  } catch {
    return null;
  }
}

function writeCache(key: string, label: string): void {
  try {
    const payload: GeocodeCacheItem = {
      label,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Cache best-effort only.
  }
}

function pickLocationLabel(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const address = (data as { address?: Record<string, string | undefined> }).address;
  if (!address) {
    return null;
  }

  const city =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.hamlet ??
    null;
  const country = address.country ?? null;

  if (city && country) {
    return `${city}, ${country}`;
  }

  return city ?? country;
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const cacheKey = toCacheKey(lat, lon);
  const cached = readCache(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      referrerPolicy: "strict-origin-when-cross-origin",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    const label = pickLocationLabel(payload);
    if (label) {
      writeCache(cacheKey, label);
    }
    return label;
  } catch {
    return null;
  }
}
