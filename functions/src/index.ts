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
  try {
    console.log("[thumbnail] query", req.query);

    const key = googleMapsStaticApiKey.value();
    if (!key) {
      res.status(500).json({ errore: "GOOGLE_MAPS_STATIC_API_KEY non configurata" });
      return;
    }

    const width = parseBoundedInt(req.query.w, 320, 64, 640);
    const height = parseBoundedInt(req.query.h, 180, 64, 360);
    const origin = toOptionalTrimmedString(req.query.origin);
    const destination = toOptionalTrimmedString(req.query.destination);
    const rawPath = toOptionalTrimmedString(req.query.path);
    const path = rawPath ? normalizePathValue(rawPath) : null;

    if (rawPath && !path) {
      res.status(400).json({ errore: "Parametro path non valido" });
      return;
    }

    if (!path && !(origin && destination)) {
      res.status(400).json({ errore: "Servono path valido oppure origin+destination" });
      return;
    }

    const queryParts = [
      `size=${width}x${height}`,
      "scale=2",
      "maptype=roadmap",
    ];

    if (path) {
      const pathParam = `color:0x0000ff|weight:4|${path}`;
      queryParts.push(`path=${pathParam}`);
    }

    if (origin) {
      queryParts.push(`markers=${encodeURIComponent(`color:green|label:A|${origin}`)}`);
    }

    if (destination) {
      queryParts.push(`markers=${encodeURIComponent(`color:red|label:B|${destination}`)}`);
    }

    queryParts.push(`key=${encodeURIComponent(key)}`);
    const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?${queryParts.join("&")}`;

    const upstreamResponse = await fetchWithTimeout(staticMapUrl, 12000);
    const status = upstreamResponse.status;
    const contentType = upstreamResponse.headers.get("content-type") ?? "image/png";
    if (!upstreamResponse.ok) {
      const text = await upstreamResponse.text();
      const details = text.slice(0, 500);
      console.error("[staticmap] HTTP", status, details);
      res.status(502).json({ errore: "Google Static Maps error", status, details });
      return;
    }

    const body = Buffer.from(await upstreamResponse.arrayBuffer());
    if (body.length === 0) {
      console.error("[staticmap] empty body", { status, contentType });
      res.status(502).json({
        errore: "Google Static Maps error",
        status,
        details: "Risposta immagine vuota da Google Static Maps",
      });
      return;
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore generazione thumbnail Google";
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[thumbnail] unhandled", { message, stack });
    res.status(500).json({
      errore: "Errore generazione thumbnail Google",
      details: message,
    });
  }
}

app.get("/api/google/thumbnail", handleGoogleThumbnail);
app.get("/google/thumbnail", handleGoogleThumbnail);

app.all("*", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

export const api = onRequest({ secrets: [googleMapsStaticApiKey] }, app);
