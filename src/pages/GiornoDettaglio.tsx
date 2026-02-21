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
} from "../services/storage";
import "../styles/theme.css";

interface GiornoDettaglioProps {
  giornoId: string;
  onBack: () => void;
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
          <h2 style={{ margin: "0 0 0.6rem 0" }}>Pianificazione Google Maps</h2>
          {giorno?.plannedMapsUrl ? (
            <>
              <p className="metaText" style={{ margin: "0 0 0.6rem 0" }}>
                Pianificazione salvata per questo giorno.
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
