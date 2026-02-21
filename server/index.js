import express from "express";

const PORT = Number.parseInt(process.env.ROUTE_SERVER_PORT ?? "5174", 10);
const app = express();

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

function buildOsrmUrl(origin, destination, excludeMotorway) {
  const base = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
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

async function fetchOsrmRoute(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OSRM HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (
    payload?.code !== "Ok" ||
    !Array.isArray(payload.routes) ||
    payload.routes.length === 0
  ) {
    const message =
      typeof payload?.message === "string" ? payload.message : "Route non disponibile";
    throw new Error(message);
  }

  return payload.routes[0];
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

app.post("/api/route", async (req, res) => {
  const origin = toRoutePoint(req.body?.origin);
  const destination = toRoutePoint(req.body?.destination);
  const modeRequested = toMode(req.body?.mode);

  if (!origin || !destination || !modeRequested) {
    res.status(400).json({
      ok: false,
      error:
        "Input non valido: origin/destination devono includere lat/lon numerici e mode deve essere direct|curvy",
    });
    return;
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
    const message = error instanceof Error ? error.message : "Errore routing OSRM";
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
  });
});

app.listen(PORT, () => {
  console.log(`[route-server] listening on http://localhost:${PORT}`);
});
