import express, { type Request, type Response } from "express";
import { getApps, initializeApp } from "firebase-admin/app";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";

if (getApps().length === 0) {
  initializeApp();
}

const googleMapsStaticApiKey = defineSecret("GOOGLE_MAPS_STATIC_API_KEY");
const app = express();

function parseBoundedInt(
  value: unknown,
  fallbackValue: number,
  minValue: number,
  maxValue: number,
): number {
  if (typeof value !== "string") {
    return fallbackValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }

  return Math.min(maxValue, Math.max(minValue, parsed));
}

function toOptionalTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function normalizePathValue(rawPath: string): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("enc:")) {
    const encoded = trimmed.slice(4).trim();
    if (!encoded || encoded.length > 4000) {
      return null;
    }
    return `enc:${encoded}`;
  }

  const rawPoints = trimmed
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (rawPoints.length < 2 || rawPoints.length > 60) {
    return null;
  }

  const normalizedPoints: string[] = [];
  for (const point of rawPoints) {
    const [latRaw, lonRaw] = point.split(",");
    if (!latRaw || !lonRaw) {
      return null;
    }

    const lat = Number.parseFloat(latRaw.trim());
    const lon = Number.parseFloat(lonRaw.trim());
    if (!isValidLatitude(lat) || !isValidLongitude(lon)) {
      return null;
    }

    normalizedPoints.push(`${lat.toFixed(6)},${lon.toFixed(6)}`);
  }

  return normalizedPoints.join("|");
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleGoogleThumbnail(req: Request, res: Response): Promise<void> {
  const key = googleMapsStaticApiKey.value();
  if (!key) {
    res.status(500).json({ error: "GOOGLE_MAPS_STATIC_API_KEY non configurata" });
    return;
  }

  const width = parseBoundedInt(req.query.w, 320, 64, 640);
  const height = parseBoundedInt(req.query.h, 180, 64, 360);
  const origin = toOptionalTrimmedString(req.query.origin);
  const destination = toOptionalTrimmedString(req.query.destination);
  const rawPath = toOptionalTrimmedString(req.query.path);
  const path = rawPath ? normalizePathValue(rawPath) : null;

  if (rawPath && !path) {
    res.status(400).json({ error: "Parametro path non valido" });
    return;
  }

  if (!path && !(origin && destination)) {
    res.status(400).json({ error: "Servono path valido oppure origin+destination" });
    return;
  }

  const staticMapUrl = new URL("https://maps.googleapis.com/maps/api/staticmap");
  staticMapUrl.searchParams.set("size", `${width}x${height}`);
  staticMapUrl.searchParams.set("scale", "2");
  staticMapUrl.searchParams.set("maptype", "roadmap");

  if (path) {
    staticMapUrl.searchParams.append("path", `color:0x1F6FEB|weight:4|${path}`);
  }

  if (origin) {
    staticMapUrl.searchParams.append("markers", `color:green|label:A|${origin}`);
  }

  if (destination) {
    staticMapUrl.searchParams.append("markers", `color:red|label:B|${destination}`);
  }

  staticMapUrl.searchParams.set("key", key);

  try {
    const upstreamResponse = await fetchWithTimeout(staticMapUrl.toString(), 12000);
    if (!upstreamResponse.ok) {
      res.status(502).json({ error: `Google Static Maps HTTP ${upstreamResponse.status}` });
      return;
    }

    const body = Buffer.from(await upstreamResponse.arrayBuffer());
    if (body.length === 0) {
      res.status(502).json({ error: "Risposta immagine vuota da Google Static Maps" });
      return;
    }

    const contentType = upstreamResponse.headers.get("content-type") ?? "image/png";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(body);
  } catch {
    res.status(500).json({ error: "Errore generazione thumbnail Google" });
  }
}

app.get("/api/google/thumbnail", handleGoogleThumbnail);
app.get("/google/thumbnail", handleGoogleThumbnail);

app.all("*", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

export const api = onRequest({ secrets: [googleMapsStaticApiKey] }, app);
