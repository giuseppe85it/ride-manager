import express from "express";

const PORT = Number.parseInt(process.env.ROUTE_SERVER_PORT ?? "5174", 10);
const app = express();
const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const OSRM_BASE_URL = "https://router.project-osrm.org";

function isValidLatitude(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

function toRoutePoint(value) {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const lat = value.lat;
  const lon = value.lon;

  if (!isValidLatitude(lat) || !isValidLongitude(lon)) {
    return null;
  }

  return { lat, lon };
}

function toMode(value) {
  if (value === "direct" || value === "curvy") {
    return value;
  }
  return null;
}

function toTrimmedString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatCoordinateLabel(point) {
  return `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`;
}

function buildOsrmUrl(origin, destination, excludeMotorway) {
  const base = `${OSRM_BASE_URL}/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  const params = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    steps: "false",
  });

  if (excludeMotorway) {
    params.set("exclude", "motorway");
  }

  return `${base}?${params.toString()}`;
}

function buildOsrmUrlForStops(stops, excludeMotorway) {
  const coordinates = stops.map((stop) => `${stop.lon},${stop.lat}`).join(";");
  const base = `${OSRM_BASE_URL}/route/v1/driving/${coordinates}`;
  const params = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    steps: "false",
  });

  if (excludeMotorway) {
    params.set("exclude", "motorway");
  }

  return `${base}?${params.toString()}`;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchOsrmRoute(url) {
  const response = await fetchJsonWithTimeout(url, {}, 12000);
  if (!response.ok) {
    throw new Error(`OSRM HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.code !== "Ok" || !Array.isArray(payload.routes) || payload.routes.length === 0) {
    const message = typeof payload?.message === "string" ? payload.message : "Route non disponibile";
    throw new Error(message);
  }

  return payload.routes[0];
}

async function fetchNominatimGeocode(query, limit = 5) {
  const params = new URLSearchParams({
    format: "json",
    q: query,
    limit: String(limit),
    addressdetails: "0",
  });
  const url = `${NOMINATIM_BASE_URL}/search?${params.toString()}`;

  const response = await fetchJsonWithTimeout(
    url,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "RideManager/1.0 (local dev)",
      },
    },
    10000,
  );

  if (!response.ok) {
    throw new Error(`Nominatim HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Risposta geocoding non valida");
  }

  const results = [];
  for (const item of payload) {
    const displayName = toTrimmedString(item?.display_name);
    const lat = Number.parseFloat(item?.lat);
    const lon = Number.parseFloat(item?.lon);
    if (!displayName || !isValidLatitude(lat) || !isValidLongitude(lon)) {
      continue;
    }
    results.push({ displayName, lat, lon });
  }

  return results;
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeGooglePointText(value) {
  const normalized = safeDecodeURIComponent(String(value).replace(/\+/g, " ")).trim();
  if (!normalized) {
    return null;
  }

  if (
    normalized.startsWith("@") ||
    normalized.startsWith("data=") ||
    normalized.startsWith("!3") ||
    normalized.startsWith("!4")
  ) {
    return null;
  }

  return normalized;
}

function isGoogleShortLinkHost(hostname) {
  return /(^|\.)maps\.app\.goo\.gl$/i.test(hostname) || /(^|\.)goo\.gl$/i.test(hostname);
}

async function expandGoogleMapsUrl(inputUrl) {
  let parsed;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new Error("URL non valido");
  }

  if (!isGoogleShortLinkHost(parsed.hostname)) {
    return parsed.toString();
  }

  const response = await fetchJsonWithTimeout(
    parsed.toString(),
    {
      redirect: "follow",
      headers: {
        Accept: "text/html,*/*",
        "User-Agent": "RideManager/1.0 (local dev)",
      },
    },
    12000,
  );

  if (!response?.url) {
    throw new Error("Impossibile espandere il link Google Maps");
  }

  return response.url;
}

function extractGoogleRoutePointsFromApiQuery(urlObject) {
  const api = urlObject.searchParams.get("api");
  const origin = normalizeGooglePointText(urlObject.searchParams.get("origin") ?? "");
  const destination = normalizeGooglePointText(urlObject.searchParams.get("destination") ?? "");

  if (api !== "1" || !origin || !destination) {
    return null;
  }

  const waypointsRaw = urlObject.searchParams.get("waypoints");
  const waypoints = waypointsRaw
    ? waypointsRaw
        .split("|")
        .map((part) => normalizeGooglePointText(part))
        .filter((part) => part !== null)
    : [];

  return [origin, ...waypoints.slice(0, 8), destination];
}

function extractGoogleRoutePointsFromPath(urlObject) {
  const marker = "/maps/dir/";
  const pathname = urlObject.pathname;
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const tail = pathname.slice(markerIndex + marker.length);
  const segments = tail
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .filter((segment) => !segment.startsWith("@") && !segment.startsWith("data="))
    .map((segment) => normalizeGooglePointText(segment))
    .filter((segment) => segment !== null)
    .slice(0, 10);

  if (segments.length < 2) {
    return null;
  }

  return segments;
}

function parseGoogleMapsRoutePoints(expandedUrl) {
  let urlObject;
  try {
    urlObject = new URL(expandedUrl);
  } catch {
    throw new Error("URL Google Maps non valido");
  }

  const fromApiQuery = extractGoogleRoutePointsFromApiQuery(urlObject);
  if (fromApiQuery && fromApiQuery.length >= 2) {
    return fromApiQuery;
  }

  const fromPath = extractGoogleRoutePointsFromPath(urlObject);
  if (fromPath && fromPath.length >= 2) {
    return fromPath;
  }

  throw new Error("Impossibile estrarre origine/destinazione dal link Google");
}

async function parseGoogleMapsRouteUrl(url) {
  const expandedUrl = await expandGoogleMapsUrl(url);
  const pointsText = parseGoogleMapsRoutePoints(expandedUrl);
  return { expandedUrl, pointsText };
}

app.use(express.json({ limit: "50kb" }));
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  if (
    typeof requestOrigin === "string" &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin)
  ) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.get("/api/geocode", async (req, res) => {
  const query = toTrimmedString(req.query.q);
  const limitRaw = Number.parseInt(String(req.query.limit ?? "5"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 5) : 5;

  if (!query) {
    res.status(400).json({ ok: false, error: "Parametro q obbligatorio" });
    return;
  }

  try {
    const results = await fetchNominatimGeocode(query, limit);
    res.json(results);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Timeout geocoding Nominatim"
        : error instanceof Error
          ? error.message
          : "Errore geocoding";
    res.status(502).json({ ok: false, error: message });
  }
});

app.post("/api/google/parse", async (req, res) => {
  const rawUrl = toTrimmedString(req.body?.url);
  if (!rawUrl) {
    res.status(400).json({ ok: false, error: "url obbligatorio" });
    return;
  }

  try {
    const parsed = await parseGoogleMapsRouteUrl(rawUrl);
    if (!Array.isArray(parsed.pointsText) || parsed.pointsText.length < 2) {
      res.status(400).json({
        ok: false,
        error: "Impossibile estrarre origine/destinazione dal link Google",
      });
      return;
    }
    res.json(parsed);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Timeout espansione/parsing link Google"
        : error instanceof Error
          ? error.message
          : "Errore parsing link Google";
    res.status(400).json({ ok: false, error: message });
  }
});

app.post("/api/route", async (req, res) => {
  const modeRequested = toMode(req.body?.mode);
  if (!modeRequested) {
    res.status(400).json({ ok: false, error: "mode deve essere direct|curvy" });
    return;
  }

  const originText = toTrimmedString(req.body?.originText);
  const destinationText = toTrimmedString(req.body?.destinationText);
  const isTextRouting = Boolean(originText || destinationText);

  let origin;
  let destination;
  let originResolved;
  let destinationResolved;

  if (isTextRouting) {
    if (!originText || !destinationText) {
      res.status(400).json({
        ok: false,
        error: "Per routing testuale servono originText e destinationText",
      });
      return;
    }

    try {
      const [originMatches, destinationMatches] = await Promise.all([
        fetchNominatimGeocode(originText, 5),
        fetchNominatimGeocode(destinationText, 5),
      ]);

      if (originMatches.length === 0) {
        res.status(400).json({ ok: false, error: `Nessun risultato per partenza: ${originText}` });
        return;
      }

      if (destinationMatches.length === 0) {
        res.status(400).json({
          ok: false,
          error: `Nessun risultato per arrivo: ${destinationText}`,
        });
        return;
      }

      originResolved = originMatches[0];
      destinationResolved = destinationMatches[0];
      origin = { lat: originResolved.lat, lon: originResolved.lon };
      destination = { lat: destinationResolved.lat, lon: destinationResolved.lon };
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Timeout geocoding Nominatim"
          : error instanceof Error
            ? error.message
            : "Errore geocoding";
      res.status(502).json({ ok: false, error: message });
      return;
    }
  } else {
    origin = toRoutePoint(req.body?.origin);
    destination = toRoutePoint(req.body?.destination);

    if (!origin || !destination) {
      res.status(400).json({
        ok: false,
        error:
          "Input non valido: usare origin/destination con lat/lon numerici oppure originText/destinationText",
      });
      return;
    }

    originResolved = {
      displayName: formatCoordinateLabel(origin),
      lat: origin.lat,
      lon: origin.lon,
    };
    destinationResolved = {
      displayName: formatCoordinateLabel(destination),
      lat: destination.lat,
      lon: destination.lon,
    };
  }

  let modeApplied = "direct";
  let route;

  try {
    if (modeRequested === "curvy") {
      try {
        route = await fetchOsrmRoute(buildOsrmUrl(origin, destination, true));
        modeApplied = "curvy";
      } catch {
        route = await fetchOsrmRoute(buildOsrmUrl(origin, destination, false));
        modeApplied = "direct";
      }
    } else {
      route = await fetchOsrmRoute(buildOsrmUrl(origin, destination, false));
      modeApplied = "direct";
    }
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Timeout routing OSRM"
        : error instanceof Error
          ? error.message
          : "Errore routing OSRM";
    res.status(502).json({ ok: false, error: message });
    return;
  }

  if (!route || !route.geometry || !Array.isArray(route.geometry.coordinates)) {
    res.status(502).json({ ok: false, error: "Geometria route non disponibile" });
    return;
  }

  const geometry = [];
  for (const coordinate of route.geometry.coordinates) {
    if (
      !Array.isArray(coordinate) ||
      coordinate.length < 2 ||
      !isValidLongitude(coordinate[0]) ||
      !isValidLatitude(coordinate[1])
    ) {
      res.status(502).json({ ok: false, error: "Coordinate geometria non valide" });
      return;
    }
    geometry.push({ lat: coordinate[1], lon: coordinate[0] });
  }

  if (geometry.length < 2) {
    res.status(502).json({ ok: false, error: "Geometria insufficiente" });
    return;
  }

  const distanceKm = Number((route.distance / 1000).toFixed(2));
  const durationMin = Number((route.duration / 60).toFixed(1));

  res.json({
    ok: true,
    modeRequested,
    modeApplied,
    distanceKm,
    durationMin,
    geometry,
    originResolved,
    destinationResolved,
  });
});

app.post("/api/google/route", async (req, res) => {
  const rawUrl = toTrimmedString(req.body?.url);
  if (!rawUrl) {
    res.status(400).json({ ok: false, error: "url obbligatorio" });
    return;
  }

  const modeRequested = toMode(req.body?.mode) ?? "direct";
  let expandedUrl;
  let pointsText;
  try {
    const parsed = await parseGoogleMapsRouteUrl(rawUrl);
    expandedUrl = parsed.expandedUrl;
    pointsText = parsed.pointsText;
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Timeout espansione/parsing link Google"
        : error instanceof Error
          ? error.message
          : "Errore parsing link Google";
    res.status(400).json({ ok: false, error: message });
    return;
  }

  if (!Array.isArray(pointsText) || pointsText.length < 2) {
    res.status(400).json({
      ok: false,
      error: "Impossibile estrarre origine/destinazione dal link Google",
    });
    return;
  }

  const stopsResolved = [];
  try {
    for (const text of pointsText) {
      const matches = await fetchNominatimGeocode(text, 5);
      if (matches.length === 0) {
        res.status(400).json({ ok: false, error: `Non trovo: ${text}` });
        return;
      }
      const best = matches[0];
      stopsResolved.push({
        text,
        displayName: best.displayName,
        lat: best.lat,
        lon: best.lon,
      });
    }
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Timeout geocoding Nominatim"
        : error instanceof Error
          ? error.message
          : "Errore geocoding";
    res.status(502).json({ ok: false, error: message });
    return;
  }

  let modeApplied = "direct";
  let route;
  const stops = stopsResolved.map((stop) => ({ lat: stop.lat, lon: stop.lon }));
  try {
    if (modeRequested === "curvy") {
      try {
        route = await fetchOsrmRoute(buildOsrmUrlForStops(stops, true));
        modeApplied = "curvy";
      } catch {
        route = await fetchOsrmRoute(buildOsrmUrlForStops(stops, false));
        modeApplied = "direct";
      }
    } else {
      route = await fetchOsrmRoute(buildOsrmUrlForStops(stops, false));
      modeApplied = "direct";
    }
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Timeout routing OSRM"
        : error instanceof Error
          ? error.message
          : "Errore routing OSRM";
    res.status(502).json({ ok: false, error: message });
    return;
  }

  if (!route || !route.geometry || !Array.isArray(route.geometry.coordinates)) {
    res.status(502).json({ ok: false, error: "Geometria route non disponibile" });
    return;
  }

  const geometry = [];
  for (const coordinate of route.geometry.coordinates) {
    if (
      !Array.isArray(coordinate) ||
      coordinate.length < 2 ||
      !isValidLongitude(coordinate[0]) ||
      !isValidLatitude(coordinate[1])
    ) {
      res.status(502).json({ ok: false, error: "Coordinate geometria non valide" });
      return;
    }
    geometry.push({ lat: coordinate[1], lon: coordinate[0] });
  }

  if (geometry.length < 2) {
    res.status(502).json({ ok: false, error: "Geometria insufficiente" });
    return;
  }

  res.json({
    ok: true,
    modeRequested,
    modeApplied,
    expandedUrl,
    pointsText,
    stopsResolved,
    distanceKm: Number((route.distance / 1000).toFixed(2)),
    durationMin: Number((route.duration / 60).toFixed(1)),
    geometry,
  });
});

app.listen(PORT, () => {
  console.log(`[route-server] listening on http://localhost:${PORT}`);
});
