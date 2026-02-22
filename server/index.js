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

app.listen(PORT, () => {
  console.log(`[route-server] listening on http://localhost:${PORT}`);
});
