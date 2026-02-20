import type { TrackPoint } from "../models/TrackPoint";
import { calculateTrackDistanceKm } from "../utils/geo";
import {
  getGiorniByViaggio,
  getGPXFilesByGiorno,
  getTrackPointsByGiorno,
} from "./storage";

export interface TripStats {
  viaggioId: string;
  kmTotali: number;
  giorniTotali: number;
  giorniConGPX: number;
  giorniVuoti: number;
  giorniCompletati: number;
  dataPrimaTraccia?: string;
  dataUltimaTraccia?: string;
  ultimoPunto?: {
    lat: number;
    lon: number;
    time: string;
  };
}

function parseIsoTime(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function sortTrackPointsByTime(points: TrackPoint[]): TrackPoint[] {
  return points
    .map((point) => ({
      point,
      timeMs: parseIsoTime(point.time),
    }))
    .filter((item): item is { point: TrackPoint; timeMs: number } => item.timeMs !== null)
    .sort((left, right) => left.timeMs - right.timeMs)
    .map((item) => item.point);
}

export async function getTripStats(viaggioId: string): Promise<TripStats> {
  try {
    const giorni = await getGiorniByViaggio(viaggioId);
    const giorniTotali = giorni.length;
    const giorniCompletati = giorni.filter((giorno) => giorno.stato === "FATTO").length;

    const perDayData = await Promise.all(
      giorni.map(async (giorno) => {
        const [gpxFiles, rawTrackPoints] = await Promise.all([
          getGPXFilesByGiorno(giorno.id),
          getTrackPointsByGiorno(giorno.id),
        ]);

        const orderedTrackPoints = sortTrackPointsByTime(rawTrackPoints);
        const kmGiorno = calculateTrackDistanceKm(
          orderedTrackPoints.map((point) => ({ lat: point.lat, lon: point.lon }))
        );

        return { gpxFiles, orderedTrackPoints, kmGiorno };
      })
    );

    let kmTotali = 0;
    let giorniConGPX = 0;
    let giorniVuoti = 0;
    let firstTraceMs: number | undefined;
    let lastTraceMs: number | undefined;
    let ultimoPunto: TripStats["ultimoPunto"];
    let ultimoPuntoMs: number | undefined;

    for (const dayData of perDayData) {
      kmTotali += dayData.kmGiorno;
      if (dayData.gpxFiles.length > 0) {
        giorniConGPX += 1;
      } else {
        giorniVuoti += 1;
      }

      for (const gpxFile of dayData.gpxFiles) {
        const startMs = parseIsoTime(gpxFile.startTime);
        const endMs = parseIsoTime(gpxFile.endTime);

        if (startMs !== null && (firstTraceMs === undefined || startMs < firstTraceMs)) {
          firstTraceMs = startMs;
        }

        if (endMs !== null && (lastTraceMs === undefined || endMs > lastTraceMs)) {
          lastTraceMs = endMs;
        }
      }

      for (const point of dayData.orderedTrackPoints) {
        const timeMs = parseIsoTime(point.time);
        if (timeMs === null) {
          continue;
        }

        if (ultimoPuntoMs === undefined || timeMs > ultimoPuntoMs) {
          ultimoPuntoMs = timeMs;
          ultimoPunto = {
            lat: point.lat,
            lon: point.lon,
            time: point.time,
          };
        }
      }
    }

    return {
      viaggioId,
      kmTotali,
      giorniTotali,
      giorniConGPX,
      giorniVuoti,
      giorniCompletati,
      dataPrimaTraccia: firstTraceMs !== undefined ? new Date(firstTraceMs).toISOString() : undefined,
      dataUltimaTraccia: lastTraceMs !== undefined ? new Date(lastTraceMs).toISOString() : undefined,
      ultimoPunto,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Errore sconosciuto durante il calcolo statistiche";
    throw new Error(`Errore calcolo statistiche viaggio: ${message}`);
  }
}
