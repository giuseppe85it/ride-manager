import { useEffect, useMemo, useRef, useState } from "react";
import type { DayPlan, PlannedRoute, PlannedRoutePoint, RideSegment } from "../models/Giorno";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import { latLngBounds } from "leaflet";

export interface PlannerWaypoint {
  id: string;
  lat: number;
  lon: number;
}

export interface PlannerSavePayload {
  plannedMapsUrl: string;
  plannedOriginText: string;
  plannedDestinationText: string;
  plannedRoute: PlannedRoute;
  dayPlan: DayPlan;
}

interface PlannerFullscreenProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: PlannerSavePayload) => void;
  initialWaypoints?: PlannerWaypoint[];
  initialMode?: "direct" | "curvy";
}

interface RouteApiSuccessResponse {
  ok: true;
  modeRequested: "direct" | "curvy";
  modeApplied: "direct" | "curvy";
  distanceKm: number;
  durationMin: number;
  geometry: PlannedRoutePoint[];
}

interface RouteApiErrorResponse {
  ok: false;
  error?: string;
}

function generateId(prefix = "wp"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toWaypointText(waypoint: PlannerWaypoint): string {
  return `${waypoint.lat.toFixed(6)},${waypoint.lon.toFixed(6)}`;
}

function reduceIntermediateWaypoints(waypoints: PlannerWaypoint[], maxIntermediates = 20): PlannerWaypoint[] {
  if (waypoints.length <= 2) {
    return [];
  }

  const intermediates = waypoints.slice(1, -1);
  if (intermediates.length <= maxIntermediates) {
    return intermediates;
  }

  const reduced: PlannerWaypoint[] = [];
  const lastIndex = intermediates.length - 1;
  for (let index = 0; index < maxIntermediates; index += 1) {
    const sourceIndex = Math.round((index * lastIndex) / (maxIntermediates - 1));
    const point = intermediates[sourceIndex];
    if (!point) {
      continue;
    }
    const prev = reduced[reduced.length - 1];
    if (prev && prev.id === point.id) {
      continue;
    }
    reduced.push(point);
  }

  return reduced;
}

function buildGoogleDirectionsUrl(waypoints: PlannerWaypoint[]): string {
  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const intermediateWaypoints = reduceIntermediateWaypoints(waypoints, 20);
  const params = new URLSearchParams();
  params.set("api", "1");
  params.set("origin", toWaypointText(origin));
  params.set("destination", toWaypointText(destination));
  params.set("travelmode", "driving");

  if (intermediateWaypoints.length > 0) {
    params.set(
      "waypoints",
      intermediateWaypoints
        .map((waypoint) => toWaypointText(waypoint))
        .join("|"),
    );
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function mergeGeometrySegments(segments: PlannedRoutePoint[][]): PlannedRoutePoint[] {
  const merged: PlannedRoutePoint[] = [];
  for (const geometry of segments) {
    for (let index = 0; index < geometry.length; index += 1) {
      const point = geometry[index];
      if (!point) {
        continue;
      }
      const prev = merged[merged.length - 1];
      if (prev && prev.lat === point.lat && prev.lon === point.lon) {
        continue;
      }
      merged.push(point);
    }
  }
  return merged;
}

function FitToGeometry({ points }: { points: LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) {
      map.fitBounds(latLngBounds(points), { padding: [24, 24] });
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], 12);
    }
  }, [map, points]);
  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(event) {
      onMapClick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

export default function PlannerFullscreen({
  isOpen,
  onClose,
  onSave,
  initialWaypoints,
  initialMode = "direct",
}: PlannerFullscreenProps) {
  const [waypoints, setWaypoints] = useState<PlannerWaypoint[]>([]);
  const [mode, setMode] = useState<"direct" | "curvy">(initialMode);
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= 900);
  const [isSheetOpen, setIsSheetOpen] = useState(true);
  const [isRouting, setIsRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<{
    modeRequested: "direct" | "curvy";
    modeApplied: "direct" | "curvy";
    distanceKm: number;
    durationMin: number;
    geometry: PlannedRoutePoint[];
  } | null>(null);
  const requestTokenRef = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const sanitized = Array.isArray(initialWaypoints)
      ? initialWaypoints
          .filter(
            (waypoint) =>
              typeof waypoint?.lat === "number" &&
              Number.isFinite(waypoint.lat) &&
              waypoint.lat >= -90 &&
              waypoint.lat <= 90 &&
              typeof waypoint?.lon === "number" &&
              Number.isFinite(waypoint.lon) &&
              waypoint.lon >= -180 &&
              waypoint.lon <= 180,
          )
          .map((waypoint) => ({
            id: waypoint.id || generateId("wp"),
            lat: waypoint.lat,
            lon: waypoint.lon,
          }))
      : [];

    setWaypoints(sanitized);
    setMode(initialMode);
    setRouteResult(null);
    setRouteError(null);
    setIsRouting(false);
    setIsSheetOpen(true);
  }, [isOpen, initialWaypoints, initialMode]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const handler = () => setIsMobile(mediaQuery.matches);
    handler();
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [isOpen]);

  const waypointSignature = useMemo(
    () => waypoints.map((waypoint) => `${waypoint.lat.toFixed(6)},${waypoint.lon.toFixed(6)}`).join(";"),
    [waypoints],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (waypoints.length < 2) {
      setRouteResult(null);
      setRouteError(null);
      setIsRouting(false);
      return;
    }

    const token = requestTokenRef.current + 1;
    requestTokenRef.current = token;
    setIsRouting(true);
    setRouteError(null);

    let cancelled = false;
    void (async () => {
      try {
        const geometryParts: PlannedRoutePoint[][] = [];
        let totalDistance = 0;
        let totalDuration = 0;
        let modeApplied: "direct" | "curvy" = mode;

        for (let index = 0; index < waypoints.length - 1; index += 1) {
          const origin = waypoints[index];
          const destination = waypoints[index + 1];
          const response = await fetch("/api/route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode,
              origin: { lat: origin.lat, lon: origin.lon },
              destination: { lat: destination.lat, lon: destination.lon },
            }),
          });
          const payload = (await response.json().catch(() => null)) as
            | RouteApiSuccessResponse
            | RouteApiErrorResponse
            | null;
          if (!response.ok || !payload || payload.ok !== true) {
            const message =
              typeof (payload as RouteApiErrorResponse | null)?.error === "string"
                ? (payload as RouteApiErrorResponse).error
                : "Errore calcolo route";
            throw new Error(message);
          }

          geometryParts.push(payload.geometry);
          totalDistance += payload.distanceKm;
          totalDuration += payload.durationMin;
          if (payload.modeApplied === "direct") {
            modeApplied = "direct";
          }
        }

        if (cancelled || token !== requestTokenRef.current) {
          return;
        }

        const mergedGeometry = mergeGeometrySegments(geometryParts);
        if (mergedGeometry.length < 2) {
          throw new Error("Geometria route insufficiente");
        }

        setRouteResult({
          modeRequested: mode,
          modeApplied,
          distanceKm: Number(totalDistance.toFixed(2)),
          durationMin: Number(totalDuration.toFixed(1)),
          geometry: mergedGeometry,
        });
      } catch (error) {
        if (cancelled || token !== requestTokenRef.current) {
          return;
        }
        const message = error instanceof Error ? error.message : "Errore routing";
        setRouteResult(null);
        setRouteError(message);
      } finally {
        if (!cancelled && token === requestTokenRef.current) {
          setIsRouting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, waypointSignature, mode]);

  const routePolyline = routeResult?.geometry ?? [];
  const mapPoints = useMemo(() => {
    if (routePolyline.length >= 2) {
      return routePolyline.map((point) => [point.lat, point.lon] as LatLngExpression);
    }
    return waypoints.map((waypoint) => [waypoint.lat, waypoint.lon] as LatLngExpression);
  }, [routePolyline, waypoints]);

  function handleAddWaypoint(lat: number, lon: number): void {
    setWaypoints((current) => [...current, { id: generateId("wp"), lat, lon }]);
  }

  function handleMoveWaypoint(waypointId: string, direction: "up" | "down"): void {
    setWaypoints((current) => {
      const index = current.findIndex((waypoint) => waypoint.id === waypointId);
      if (index < 0) {
        return current;
      }
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  }

  function handleRemoveWaypoint(waypointId: string): void {
    setWaypoints((current) => current.filter((waypoint) => waypoint.id !== waypointId));
  }

  function handleSavePlanner(): void {
    if (!routeResult || waypoints.length < 2) {
      return;
    }

    const nowIso = new Date().toISOString();
    const origin = waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const waypointTexts = waypoints.map((waypoint) => toWaypointText(waypoint));
    const rideSegment: RideSegment = {
      id: generateId("ride"),
      type: "RIDE",
      originText: toWaypointText(origin),
      destinationText: toWaypointText(destination),
      modeRequested: routeResult.modeRequested,
      modeApplied: routeResult.modeApplied,
      distanceKm: routeResult.distanceKm,
      durationMin: routeResult.durationMin,
      geometry: routeResult.geometry,
    };

    const payload: PlannerSavePayload = {
      plannedMapsUrl: buildGoogleDirectionsUrl(waypoints),
      plannedOriginText: toWaypointText(origin),
      plannedDestinationText: toWaypointText(destination),
      plannedRoute: {
        engine: "osrm",
        modeRequested: routeResult.modeRequested,
        modeApplied: routeResult.modeApplied,
        source: "osrm-text",
        pointsText: waypointTexts,
        distanceKm: routeResult.distanceKm,
        durationMin: routeResult.durationMin,
        geometry: routeResult.geometry,
        createdAt: nowIso,
      },
      dayPlan: {
        segments: [rideSegment],
        boardingBufferMin: 45,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    };

    onSave(payload);
  }

  if (!isOpen) {
    return null;
  }

  const panel = (
    <div
      style={{
        background: "rgba(12, 19, 37, 0.96)",
        border: "1px solid #2A3445",
        borderRadius: isMobile ? "14px 14px 0 0" : 14,
        padding: "0.85rem",
        color: "#EAF1FF",
        display: "grid",
        gap: "0.65rem",
        maxHeight: isMobile ? "55vh" : "100%",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
        <strong>Waypoint</strong>
        <span className="metaText" style={{ margin: 0 }}>
          {waypoints.length} punti
        </span>
      </div>

      <select
        className="inputField"
        value={mode}
        onChange={(event) => setMode(event.target.value as "direct" | "curvy")}
      >
        <option value="direct">Direct</option>
        <option value="curvy">Curvy</option>
      </select>

      <p className="metaText" style={{ margin: 0 }}>
        Tocca la mappa per aggiungere punti.
      </p>

      {waypoints.length === 0 && <p className="metaText" style={{ margin: 0 }}>Nessun waypoint.</p>}

      {waypoints.length > 0 && (
        <ul className="listPlain" style={{ margin: 0, display: "grid", gap: "0.45rem" }}>
          {waypoints.map((waypoint, index) => (
            <li key={waypoint.id} className="card detailCard" style={{ padding: "0.55rem" }}>
              <p style={{ margin: "0 0 0.35rem 0", fontWeight: 600 }}>WP {index + 1}</p>
              <p className="metaText" style={{ margin: "0 0 0.45rem 0" }}>
                {toWaypointText(waypoint)}
              </p>
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                <button type="button" className="buttonGhost" onClick={() => handleMoveWaypoint(waypoint.id, "up")}>
                  Su
                </button>
                <button type="button" className="buttonGhost" onClick={() => handleMoveWaypoint(waypoint.id, "down")}>
                  Giu
                </button>
                <button
                  type="button"
                  className="buttonGhost"
                  onClick={() => handleRemoveWaypoint(waypoint.id)}
                >
                  Rimuovi
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="card detailCard" style={{ padding: "0.65rem" }}>
        {isRouting && <p className="metaText" style={{ margin: 0 }}>Calcolo percorso...</p>}
        {!isRouting && routeResult && (
          <>
            <p className="metaText" style={{ margin: "0 0 0.2rem 0" }}>
              Distanza: {routeResult.distanceKm.toFixed(2)} km
            </p>
            <p className="metaText" style={{ margin: 0 }}>
              Durata: {routeResult.durationMin.toFixed(1)} min
            </p>
          </>
        )}
        {!isRouting && routeError && <p className="errorText" style={{ margin: 0 }}>{routeError}</p>}
        {!isRouting && !routeResult && !routeError && (
          <p className="metaText" style={{ margin: 0 }}>Aggiungi almeno 2 waypoint per calcolare la route.</p>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" className="buttonGhost" onClick={onClose}>
          Annulla
        </button>
        <button
          type="button"
          className="buttonPrimary"
          disabled={isRouting || !routeResult || waypoints.length < 2}
          onClick={handleSavePlanner}
        >
          Salva
        </button>
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(5, 8, 20, 0.95)",
        display: "grid",
        gridTemplateRows: "auto 1fr",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.85rem 1rem",
          borderBottom: "1px solid #2A3445",
        }}
      >
        <h2 style={{ margin: 0 }}>Pianifica su mappa</h2>
        <button type="button" className="buttonGhost" onClick={onClose}>
          Chiudi
        </button>
      </div>

      {!isMobile ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "340px 1fr",
            gap: "0.8rem",
            padding: "0.8rem",
            minHeight: 0,
          }}
        >
          {panel}
          <div className="card detailCard" style={{ padding: "0.45rem", minHeight: 0 }}>
            <div style={{ width: "100%", height: "100%", minHeight: 360, borderRadius: 10, overflow: "hidden" }}>
              <MapContainer center={[42.0, 12.0]} zoom={6} style={{ width: "100%", height: "100%" }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapClickHandler onMapClick={handleAddWaypoint} />
                {waypoints.map((waypoint, index) => (
                  <CircleMarker
                    key={waypoint.id}
                    center={[waypoint.lat, waypoint.lon]}
                    radius={6}
                    pathOptions={{ color: "#FFFFFF", fillColor: "#1F6FEB", fillOpacity: 1 }}
                  >
                    <Tooltip direction="top" offset={[0, -6]} permanent>
                      {index + 1}
                    </Tooltip>
                  </CircleMarker>
                ))}
                {routePolyline.length >= 2 && (
                  <Polyline
                    positions={routePolyline.map((point) => [point.lat, point.lon] as LatLngExpression)}
                    pathOptions={{ color: "#1F6FEB", weight: 4 }}
                  />
                )}
                {routePolyline.length < 2 && waypoints.length >= 2 && (
                  <Polyline
                    positions={waypoints.map((waypoint) => [waypoint.lat, waypoint.lon] as LatLngExpression)}
                    pathOptions={{ color: "#64748B", weight: 2, dashArray: "4 6" }}
                  />
                )}
                <FitToGeometry points={mapPoints} />
              </MapContainer>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ position: "relative", minHeight: 0 }}>
          <div style={{ position: "absolute", inset: 0 }}>
            <MapContainer center={[42.0, 12.0]} zoom={6} style={{ width: "100%", height: "100%" }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapClickHandler onMapClick={handleAddWaypoint} />
              {waypoints.map((waypoint, index) => (
                <CircleMarker
                  key={waypoint.id}
                  center={[waypoint.lat, waypoint.lon]}
                  radius={6}
                  pathOptions={{ color: "#FFFFFF", fillColor: "#1F6FEB", fillOpacity: 1 }}
                >
                  <Tooltip direction="top" offset={[0, -6]} permanent>
                    {index + 1}
                  </Tooltip>
                </CircleMarker>
              ))}
              {routePolyline.length >= 2 && (
                <Polyline
                  positions={routePolyline.map((point) => [point.lat, point.lon] as LatLngExpression)}
                  pathOptions={{ color: "#1F6FEB", weight: 4 }}
                />
              )}
              {routePolyline.length < 2 && waypoints.length >= 2 && (
                <Polyline
                  positions={waypoints.map((waypoint) => [waypoint.lat, waypoint.lon] as LatLngExpression)}
                  pathOptions={{ color: "#64748B", weight: 2, dashArray: "4 6" }}
                />
              )}
              <FitToGeometry points={mapPoints} />
            </MapContainer>
          </div>

          <div style={{ position: "absolute", left: 8, right: 8, bottom: 8, display: "grid", gap: "0.45rem" }}>
            <button type="button" className="buttonGhost" onClick={() => setIsSheetOpen((current) => !current)}>
              {isSheetOpen ? "Chiudi pannello waypoint" : "Apri pannello waypoint"}
            </button>
            {isSheetOpen && panel}
          </div>
        </div>
      )}
    </div>
  );
}
