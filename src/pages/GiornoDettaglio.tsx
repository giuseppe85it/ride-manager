import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { Giorno } from "../models/Giorno";
import type { GPXFile } from "../models/GPXFile";
import type { Prenotazione } from "../models/Prenotazione";
import type { TrackPoint } from "../models/TrackPoint";
import DayMap from "../components/DayMap";
import { reverseGeocode } from "../services/geocodeService";
import { importGPXFile } from "../services/gpxService";
import { calculateTrackDistanceKm } from "../utils/geo";
import { splitTrackIntoSegments } from "../utils/trackSegmentation";
import {
  deleteGPXFile,
  deleteTrackPointsByGpxFileId,
  getGiorno,
  getGPXFilesByGiorno,
  getPrenotazione,
  getTrackPointsByGiorno,
  saveGiorno,
} from "../services/storage";
import "../styles/theme.css";

interface GiornoDettaglioProps {
  giornoId: string;
  onBack: () => void;
}

interface GeocodeSuggestion {
  displayName: string;
  lat: number;
  lon: number;
}

interface RouteApiSuccessResponse {
  ok: true;
  modeRequested: "direct" | "curvy";
  modeApplied: "direct" | "curvy";
  distanceKm: number;
  durationMin: number;
  geometry: Array<{ lat: number; lon: number }>;
  originResolved: GeocodeSuggestion;
  destinationResolved: GeocodeSuggestion;
}

interface RouteApiErrorResponse {
  ok: false;
  error?: string;
}

const dateFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateIT(iso: string | null): string {
  if (!iso) {
    return "-";
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }

  return dateFormatter.format(parsed);
}

function formatTimeIT(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "\u2014";
  }

  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatGapDuration(durationSec: number): string {
  const totalMinutes = Math.round(durationSec / 60);
  if (totalMinutes < 1) {
    return "< 1 min";
  }
  if (totalMinutes === 1) {
    return "1 min";
  }
  return `${totalMinutes} min`;
}

function isRouteApiSuccessResponse(value: unknown): value is RouteApiSuccessResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as {
    ok?: unknown;
    modeRequested?: unknown;
    modeApplied?: unknown;
    distanceKm?: unknown;
    durationMin?: unknown;
    geometry?: unknown;
    originResolved?: unknown;
    destinationResolved?: unknown;
  };

  if (record.ok !== true) {
    return false;
  }

  if (
    (record.modeRequested !== "direct" && record.modeRequested !== "curvy") ||
    (record.modeApplied !== "direct" && record.modeApplied !== "curvy")
  ) {
    return false;
  }

  if (
    typeof record.distanceKm !== "number" ||
    !Number.isFinite(record.distanceKm) ||
    typeof record.durationMin !== "number" ||
    !Number.isFinite(record.durationMin)
  ) {
    return false;
  }

  if (!Array.isArray(record.geometry) || record.geometry.length < 2) {
    return false;
  }

  for (const point of record.geometry) {
    if (typeof point !== "object" || point === null) {
      return false;
    }
    const lat = (point as { lat?: unknown }).lat;
    const lon = (point as { lon?: unknown }).lon;
    if (
      typeof lat !== "number" ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      typeof lon !== "number" ||
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180
    ) {
      return false;
    }
  }

  for (const endpoint of [record.originResolved, record.destinationResolved]) {
    if (typeof endpoint !== "object" || endpoint === null) {
      return false;
    }
    const displayName = (endpoint as { displayName?: unknown }).displayName;
    const lat = (endpoint as { lat?: unknown }).lat;
    const lon = (endpoint as { lon?: unknown }).lon;
    if (
      typeof displayName !== "string" ||
      !displayName.trim() ||
      typeof lat !== "number" ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      typeof lon !== "number" ||
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180
    ) {
      return false;
    }
  }

  return true;
}

function isGeocodeSuggestionArray(value: unknown): value is GeocodeSuggestion[] {
  if (!Array.isArray(value)) {
    return false;
  }

  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      return false;
    }

    const displayName = (item as { displayName?: unknown }).displayName;
    const lat = (item as { lat?: unknown }).lat;
    const lon = (item as { lon?: unknown }).lon;

    if (
      typeof displayName !== "string" ||
      !displayName.trim() ||
      typeof lat !== "number" ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      typeof lon !== "number" ||
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180
    ) {
      return false;
    }
  }

  return true;
}

export default function GiornoDettaglio({ giornoId, onBack }: GiornoDettaglioProps) {
  const [giorno, setGiorno] = useState<Giorno | null>(null);
  const [hotelPrenotazione, setHotelPrenotazione] = useState<Prenotazione | null>(null);
  const [gpxFiles, setGpxFiles] = useState<GPXFile[]>([]);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [showAllGaps, setShowAllGaps] = useState(false);
  const [startLocation, setStartLocation] = useState<string>("N/D");
  const [endLocation, setEndLocation] = useState<string>("N/D");
  const [isResolvingLocations, setIsResolvingLocations] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isGeneratingRoute, setIsGeneratingRoute] = useState(false);
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false);
  const [isSearchingDestination, setIsSearchingDestination] = useState(false);
  const [routeMode, setRouteMode] = useState<"direct" | "curvy">("direct");
  const [originText, setOriginText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [originSuggestions, setOriginSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function reloadDataForDay(targetGiornoId: string): Promise<void> {
    const [gpxRecords, pointRecords, giornoRecord] = await Promise.all([
      getGPXFilesByGiorno(targetGiornoId),
      getTrackPointsByGiorno(targetGiornoId),
      getGiorno(targetGiornoId),
    ]);

    let hotelRecord: Prenotazione | null = null;
    if (giornoRecord?.hotelPrenotazioneId) {
      hotelRecord = (await getPrenotazione(giornoRecord.hotelPrenotazioneId)) ?? null;
    }

    setGiorno(giornoRecord ?? null);
    setHotelPrenotazione(hotelRecord);
    setGpxFiles(gpxRecords);
    setTrackPoints(pointRecords);
  }

  useEffect(() => {
    let isActive = true;

    async function loadData(): Promise<void> {
      try {
        const [gpxRecords, pointRecords, giornoRecord] = await Promise.all([
          getGPXFilesByGiorno(giornoId),
          getTrackPointsByGiorno(giornoId),
          getGiorno(giornoId),
        ]);
        if (!isActive) {
          return;
        }
        let hotelRecord: Prenotazione | null = null;
        if (giornoRecord?.hotelPrenotazioneId) {
          hotelRecord = (await getPrenotazione(giornoRecord.hotelPrenotazioneId)) ?? null;
          if (!isActive) {
            return;
          }
        }
        setGiorno(giornoRecord ?? null);
        setHotelPrenotazione(hotelRecord);
        setGpxFiles(gpxRecords);
        setTrackPoints(pointRecords);
        setError(null);
      } catch (loadError) {
        if (isActive) {
          const message =
            loadError instanceof Error ? loadError.message : "Errore caricamento dati giorno";
          setError(message);
        }
      }
    }

    void loadData();

    return () => {
      isActive = false;
    };
  }, [giornoId]);

  useEffect(() => {
    if (!giorno) {
      return;
    }

    setOriginText(giorno.plannedOriginText ?? "");
    setDestinationText(giorno.plannedDestinationText ?? "");
    if (giorno.plannedRoute) {
      setRouteMode(giorno.plannedRoute.modeRequested);
    }
  }, [giorno]);

  async function handleImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      await importGPXFile(file, giornoId);
      await reloadDataForDay(giornoId);
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : "Errore import GPX BMW";
      setError(message);
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  }

  async function handleDeleteGPX(gpxFileId: string): Promise<void> {
    const confirmed = window.confirm("Confermi la cancellazione di questo GPX?");
    if (!confirmed) {
      return;
    }

    try {
      setError(null);
      await deleteTrackPointsByGpxFileId(gpxFileId);
      await deleteGPXFile(gpxFileId);
      await reloadDataForDay(giornoId);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Errore cancellazione GPX";
      setError(message);
    }
  }

  async function searchGeocode(
    query: string,
    target: "origin" | "destination",
  ): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) {
      if (target === "origin") {
        setOriginSuggestions([]);
      } else {
        setDestinationSuggestions([]);
      }
      return;
    }

    if (target === "origin") {
      setIsSearchingOrigin(true);
    } else {
      setIsSearchingDestination(true);
    }

    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}&limit=5`);
      const payload = (await response.json()) as unknown;

      if (!response.ok || !isGeocodeSuggestionArray(payload)) {
        const message =
          typeof (payload as { error?: unknown })?.error === "string"
            ? (payload as { error: string }).error
            : "Errore geocoding";
        throw new Error(message);
      }

      if (target === "origin") {
        setOriginSuggestions(payload.slice(0, 5));
      } else {
        setDestinationSuggestions(payload.slice(0, 5));
      }
      setError(null);
    } catch (geocodeError) {
      if (target === "origin") {
        setOriginSuggestions([]);
      } else {
        setDestinationSuggestions([]);
      }
      const message = geocodeError instanceof Error ? geocodeError.message : "Errore geocoding";
      setError(message);
    } finally {
      if (target === "origin") {
        setIsSearchingOrigin(false);
      } else {
        setIsSearchingDestination(false);
      }
    }
  }

  function selectOriginSuggestion(suggestion: GeocodeSuggestion): void {
    setOriginText(suggestion.displayName);
    setOriginSuggestions([]);
  }

  function selectDestinationSuggestion(suggestion: GeocodeSuggestion): void {
    setDestinationText(suggestion.displayName);
    setDestinationSuggestions([]);
  }

  function handleUseHotelForDestination(): void {
    if (!hotelPrenotazione) {
      return;
    }

    const candidate = [
      hotelPrenotazione.indirizzo,
      hotelPrenotazione.localita,
      hotelPrenotazione.titolo,
    ].find((value): value is string => typeof value === "string" && value.trim().length > 0);

    if (!candidate) {
      return;
    }

    setDestinationText(candidate.trim());
    setDestinationSuggestions([]);
  }

  async function handleGeneratePlannedRoute(): Promise<void> {
    if (!giorno) {
      setError("Dati giorno non disponibili.");
      return;
    }

    const originTextTrimmed = originText.trim();
    const destinationTextTrimmed = destinationText.trim();
    if (!originTextTrimmed || !destinationTextTrimmed) {
      setError("Inserisci partenza e arrivo.");
      return;
    }

    setIsGeneratingRoute(true);
    setError(null);

    try {
      const response = await fetch("/api/route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originText: originTextTrimmed,
          destinationText: destinationTextTrimmed,
          mode: routeMode,
        }),
      });

      const payload = (await response.json()) as RouteApiSuccessResponse | RouteApiErrorResponse;

      if (!response.ok || !isRouteApiSuccessResponse(payload)) {
        const message =
          typeof (payload as RouteApiErrorResponse).error === "string"
            ? (payload as RouteApiErrorResponse).error
            : "Errore generazione route";
        throw new Error(message);
      }

      const nextGiorno: Giorno = {
        ...giorno,
        plannedOriginText: payload.originResolved.displayName,
        plannedDestinationText: payload.destinationResolved.displayName,
        plannedRoute: {
          engine: "osrm",
          modeRequested: payload.modeRequested,
          modeApplied: payload.modeApplied,
          distanceKm: payload.distanceKm,
          durationMin: payload.durationMin,
          geometry: payload.geometry,
          createdAt: new Date().toISOString(),
        },
      };

      await saveGiorno(nextGiorno);
      setGiorno(nextGiorno);
      setOriginText(payload.originResolved.displayName);
      setDestinationText(payload.destinationResolved.displayName);
      setOriginSuggestions([]);
      setDestinationSuggestions([]);
    } catch (routeError) {
      const message =
        routeError instanceof Error ? routeError.message : "Errore generazione route";
      setError(message);
    } finally {
      setIsGeneratingRoute(false);
    }
  }

  const orderedTrackPoints = useMemo(() => {
    return trackPoints
      .map((trackPoint) => ({
        ...trackPoint,
        timeMs: Date.parse(trackPoint.time),
      }))
      .filter((trackPoint) => !Number.isNaN(trackPoint.timeMs))
      .sort((left, right) => left.timeMs - right.timeMs);
  }, [trackPoints]);

  const firstPointTime = orderedTrackPoints.length > 0 ? orderedTrackPoints[0].time : null;
  const lastPointTime =
    orderedTrackPoints.length > 0 ? orderedTrackPoints[orderedTrackPoints.length - 1].time : null;
  const firstPoint = orderedTrackPoints.length > 0 ? orderedTrackPoints[0] : null;
  const lastPoint = orderedTrackPoints.length > 0 ? orderedTrackPoints[orderedTrackPoints.length - 1] : null;
  const distanzaKm = useMemo(
    () => calculateTrackDistanceKm(orderedTrackPoints),
    [orderedTrackPoints]
  );
  const distanzaKmRounded = distanzaKm.toFixed(1);
  const segmentation = useMemo(
    () =>
      splitTrackIntoSegments(
        orderedTrackPoints.map((point) => ({
          lat: point.lat,
          lon: point.lon,
          time: point.time,
        })),
        { gapTimeSec: 60 }
      ),
    [orderedTrackPoints]
  );
  const segments = segmentation.segments;
  const gaps = segmentation.gaps;
  const displayedGaps = showAllGaps ? gaps : gaps.slice(0, 3);

  useEffect(() => {
    setShowAllGaps(false);
  }, [gaps.length]);

  useEffect(() => {
    let isActive = true;

    async function loadLocations(): Promise<void> {
      if (!firstPoint || !lastPoint) {
        setStartLocation("N/D");
        setEndLocation("N/D");
        setIsResolvingLocations(false);
        return;
      }

      setStartLocation("...");
      setEndLocation("...");
      setIsResolvingLocations(true);

      const sameCoordinates = firstPoint.lat === lastPoint.lat && firstPoint.lon === lastPoint.lon;
      if (sameCoordinates) {
        const label = await reverseGeocode(firstPoint.lat, firstPoint.lon);
        if (!isActive) {
          return;
        }
        const location = label ?? "N/D";
        setStartLocation(location);
        setEndLocation(location);
        setIsResolvingLocations(false);
        return;
      }

      const [startLabel, endLabel] = await Promise.all([
        reverseGeocode(firstPoint.lat, firstPoint.lon),
        reverseGeocode(lastPoint.lat, lastPoint.lon),
      ]);

      if (!isActive) {
        return;
      }

      setStartLocation(startLabel ?? "N/D");
      setEndLocation(endLabel ?? "N/D");
      setIsResolvingLocations(false);
    }

    void loadLocations();

    return () => {
      isActive = false;
    };
  }, [firstPoint?.lat, firstPoint?.lon, lastPoint?.lat, lastPoint?.lon]);

  function handleOpenPlannedMap(): void {
    if (!giorno?.plannedMapsUrl) {
      return;
    }
    window.open(giorno.plannedMapsUrl, "_blank", "noopener,noreferrer");
  }

  function handleOpenHotelMap(): void {
    const queryParts = [hotelPrenotazione?.titolo, hotelPrenotazione?.localita, hotelPrenotazione?.indirizzo]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());

    if (queryParts.length === 0) {
      return;
    }

    const query = encodeURIComponent(queryParts.join(", "));
    const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const canOpenHotelMap = Boolean(
    hotelPrenotazione &&
      [hotelPrenotazione.titolo, hotelPrenotazione.localita, hotelPrenotazione.indirizzo].some(
        (value) => typeof value === "string" && value.trim().length > 0,
      ),
  );
  const hotelDestinationCandidate =
    [hotelPrenotazione?.indirizzo, hotelPrenotazione?.localita, hotelPrenotazione?.titolo].find(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    ) ?? null;
  const canUseHotelForDestination = Boolean(hotelDestinationCandidate);

  return (
    <main className="pageWrap">
      <div className="pageContainer">
        <div className="toolbar">
          <button type="button" onClick={onBack} className="buttonGhost">
            {"\u2190"} Dettaglio viaggio
          </button>
          <h1 className="pageTitle">Giorno dettaglio</h1>
        </div>

        <div className="card detailCard" style={{ marginBottom: "1rem" }}>
          <h2 style={{ margin: "0 0 0.6rem 0" }}>Pianificazione</h2>
          <p className="metaText" style={{ margin: "0 0 0.6rem 0" }}>
            Routing locale OSRM con geocoding Nominatim (input testo).
          </p>
          <div
            style={{
              display: "grid",
              gap: "0.75rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              marginBottom: "0.7rem",
            }}
          >
            <div style={{ display: "grid", gap: "0.5rem", alignContent: "start" }}>
              <label style={{ fontWeight: 600 }}>Partenza</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  className="inputField"
                  value={originText}
                  onChange={(event) => setOriginText(event.target.value)}
                  placeholder='Es. "Bastia" o indirizzo'
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="buttonGhost"
                  onClick={() => void searchGeocode(originText, "origin")}
                  disabled={isSearchingOrigin || !originText.trim()}
                >
                  {isSearchingOrigin ? "..." : "Cerca"}
                </button>
              </div>
              {originSuggestions.length > 0 && (
                <ul className="listPlain card" style={{ padding: "0.4rem", margin: 0 }}>
                  {originSuggestions.map((suggestion, index) => (
                    <li key={`${suggestion.displayName}-${index}`}>
                      <button
                        type="button"
                        className="itemButton"
                        onClick={() => selectOriginSuggestion(suggestion)}
                      >
                        {suggestion.displayName}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ display: "grid", gap: "0.5rem", alignContent: "start" }}>
              <label style={{ fontWeight: 600 }}>Arrivo</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  className="inputField"
                  value={destinationText}
                  onChange={(event) => setDestinationText(event.target.value)}
                  placeholder='Es. "Saint-Florent" o indirizzo'
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="buttonGhost"
                  onClick={() => void searchGeocode(destinationText, "destination")}
                  disabled={isSearchingDestination || !destinationText.trim()}
                >
                  {isSearchingDestination ? "..." : "Cerca"}
                </button>
              </div>
              {destinationSuggestions.length > 0 && (
                <ul className="listPlain card" style={{ padding: "0.4rem", margin: 0 }}>
                  {destinationSuggestions.map((suggestion, index) => (
                    <li key={`${suggestion.displayName}-${index}`}>
                      <button
                        type="button"
                        className="itemButton"
                        onClick={() => selectDestinationSuggestion(suggestion)}
                      >
                        {suggestion.displayName}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <button
                  type="button"
                  className="buttonGhost"
                  onClick={handleUseHotelForDestination}
                  disabled={!canUseHotelForDestination}
                >
                  Usa Hotel del giorno
                </button>
              </div>
            </div>

            <select
              className="inputField"
              value={routeMode}
              onChange={(event) => setRouteMode(event.target.value as "direct" | "curvy")}
            >
              <option value="direct">Direct</option>
              <option value="curvy">Curvy</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleGeneratePlannedRoute()}
            className="buttonPrimary"
            disabled={isGeneratingRoute}
          >
            {isGeneratingRoute ? "Generazione..." : "Genera percorso"}
          </button>

          {giorno?.plannedRoute && (
            <>
              <div style={{ marginTop: "0.75rem", marginBottom: "0.6rem" }}>
                <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
                  Partenza: {giorno.plannedOriginText ?? "—"}
                </p>
                <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
                  Arrivo: {giorno.plannedDestinationText ?? "—"}
                </p>
                <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
                  Mode richiesto: {giorno.plannedRoute.modeRequested}
                </p>
                <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
                  Mode applicato: {giorno.plannedRoute.modeApplied}
                </p>
                <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
                  Distanza stimata: {giorno.plannedRoute.distanceKm.toFixed(2)} km
                </p>
                <p className="metaText" style={{ margin: 0 }}>
                  Durata stimata: {giorno.plannedRoute.durationMin.toFixed(1)} min
                </p>
              </div>
              <DayMap segments={[giorno.plannedRoute.geometry]} />
            </>
          )}

          <div style={{ borderTop: "1px solid #2A3445", marginTop: "0.9rem", paddingTop: "0.75rem" }}>
            <h3 style={{ margin: "0 0 0.45rem 0", fontSize: "1rem" }}>Google Maps directions</h3>
            {giorno?.plannedMapsUrl ? (
              <>
                <p className="metaText" style={{ margin: "0 0 0.6rem 0" }}>
                  Pianificazione Google Maps salvata per questo giorno.
                </p>
                <button type="button" onClick={handleOpenPlannedMap} className="buttonPrimary">
                  VAI (Google Maps)
                </button>
              </>
            ) : (
              <>
                <p className="metaText" style={{ margin: "0 0 0.6rem 0" }}>
                  Nessun link pianificazione impostato.
                </p>
                <button type="button" onClick={onBack} className="buttonGhost">
                  Aggiungi pianificazione
                </button>
              </>
            )}
          </div>
        </div>

        {hotelPrenotazione && (
          <div className="card detailCard" style={{ marginBottom: "1rem" }}>
            <h2 style={{ margin: "0 0 0.6rem 0" }}>Hotel del giorno</h2>
            <p style={{ margin: "0 0 0.25rem 0", fontWeight: 700 }}>{hotelPrenotazione.titolo}</p>
            {hotelPrenotazione.localita && (
              <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
                Localita: {hotelPrenotazione.localita}
              </p>
            )}
            {hotelPrenotazione.indirizzo && (
              <p className="metaText" style={{ margin: "0 0 0.6rem 0" }}>
                Indirizzo: {hotelPrenotazione.indirizzo}
              </p>
            )}
            <button
              type="button"
              onClick={handleOpenHotelMap}
              className="buttonGhost"
              disabled={!canOpenHotelMap}
            >
              Vai all'hotel
            </button>
          </div>
        )}

        <div className="card" style={{ padding: "0.85rem", marginBottom: "1rem" }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="buttonPrimary"
          >
            Importa GPX BMW
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx"
            onChange={(event) => void handleImport(event)}
            disabled={isImporting}
            className="hiddenInput"
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <h2 style={{ margin: "0 0 0.5rem 0" }}>Percorso</h2>
          <p className="metaText" style={{ margin: "0 0 0.5rem 0" }}>
            Trackpoints caricati: {trackPoints.length}
          </p>
          <div
            className="percorso-stat"
            style={{ fontSize: 16, fontWeight: 600, marginTop: 4, marginBottom: 8 }}
          >
            Km reali: {distanzaKmRounded} km
          </div>
          <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
            Inizio reale: {formatDateIT(firstPointTime)}
          </p>
          <p className="metaText" style={{ margin: "0 0 0.5rem 0" }}>
            Fine reale: {formatDateIT(lastPointTime)}
          </p>
          <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
            Luogo inizio: {isResolvingLocations ? `${startLocation} (ricerca)` : startLocation}
          </p>
          <p className="metaText" style={{ margin: "0 0 0.5rem 0" }}>
            Luogo fine: {isResolvingLocations ? `${endLocation} (ricerca)` : endLocation}
          </p>

          {gaps.length > 0 && (
            <div className="card detailCard" style={{ padding: "0.75rem", marginBottom: "0.6rem" }}>
              <p style={{ margin: "0 0 0.3rem 0", fontWeight: 700 }}>Traccia incompleta</p>
              <p className="metaText" style={{ margin: "0 0 0.5rem 0" }}>
                Rilevati gap GPS (nessun punto registrato).
              </p>
              <ul className="listPlain" style={{ marginBottom: gaps.length > 3 ? "0.45rem" : 0 }}>
                {displayedGaps.map((gap, index) => (
                  <li key={`${gap.fromTime}-${gap.toTime}-${index}`} className="metaText">
                    Gap: {formatGapDuration(gap.durationSec)} (da {formatTimeIT(gap.fromTime)} a{" "}
                    {formatTimeIT(gap.toTime)}){" "}
                    {typeof gap.approxDistanceKm === "number"
                      ? `- ~${gap.approxDistanceKm.toFixed(1)} km`
                      : ""}
                  </li>
                ))}
              </ul>
              {gaps.length > 3 && (
                <button
                  type="button"
                  className="buttonGhost"
                  onClick={() => setShowAllGaps((current) => !current)}
                >
                  {showAllGaps ? "Mostra meno" : `Mostra tutti (${gaps.length})`}
                </button>
              )}
            </div>
          )}

          <DayMap segments={segments} />
        </div>

        {isImporting && <p className="metaText">Import in corso...</p>}
        {error && <p className="errorText">{error}</p>}
        {gpxFiles.length === 0 && <p className="metaText">Nessun file GPX importato.</p>}

        {gpxFiles.length > 0 && (
          <ul className="listPlain cardsGrid">
            {gpxFiles.map((gpxFile) => (
              <li key={gpxFile.id} className="card detailCard" style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => void handleDeleteGPX(gpxFile.id)}
                  aria-label="Cancella GPX"
                  style={{
                    position: "absolute",
                    top: "0.5rem",
                    right: "0.5rem",
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    border: "1px solid #E11D48",
                    background: "rgba(225,29,72,0.15)",
                    color: "#E11D48",
                    cursor: "pointer",
                    fontSize: "1rem",
                    lineHeight: 1,
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.background = "rgba(225,29,72,0.28)";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.background = "rgba(225,29,72,0.15)";
                  }}
                >
                  {"\u2715"}
                </button>
                <p style={{ margin: "0 0 0.25rem 0" }}>
                  <strong>Nome file:</strong> {gpxFile.name}
                </p>
                <p style={{ margin: "0 0 0.25rem 0" }}>
                  <strong>Punti:</strong> {gpxFile.pointsCount}
                </p>
                <p style={{ margin: "0 0 0.25rem 0" }}>
                  <strong>Inizio:</strong> {formatDateIT(gpxFile.startTime)}
                </p>
                <p style={{ margin: "0 0 0.25rem 0" }}>
                  <strong>Fine:</strong> {formatDateIT(gpxFile.endTime)}
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Durata min:</strong> {gpxFile.durationMin}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
