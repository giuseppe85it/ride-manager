import type { GPXFile } from "../models/GPXFile";
import type { TrackPoint } from "../models/TrackPoint";
import { saveGPXFile, saveTrackPoints } from "./storage";

export interface ParsedTrackPoint {
  lat: number;
  lon: number;
  time: string;
  elevation: number;
}

export interface ParsedGPX {
  trackPoints: ParsedTrackPoint[];
}

export interface GPXStats {
  startTime: string;
  endTime: string;
  durationMin: number;
}

interface GPXRecordOptions {
  id: string;
  giornoId: string;
  kind?: GPXFile["kind"];
  uri?: string;
  pointsCount: number;
}

function generateId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toNumber(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export async function importGPXFile(file: File, giornoId = ""): Promise<GPXFile> {
  if (!giornoId.trim()) {
    throw new Error("giornoId is required for GPX import");
  }

  const text = await file.text();
  const parsed = parseGPX(text);

  if (parsed.trackPoints.length === 0) {
    throw new Error("No valid BMW track points found in GPX");
  }

  const gpxFileId = generateId("gpx");
  const stats = computeStats(parsed.trackPoints);
  const gpxFile = createGPXFileRecord(file, stats, {
    id: gpxFileId,
    giornoId,
    pointsCount: parsed.trackPoints.length,
  });

  const trackPoints: TrackPoint[] = parsed.trackPoints.map((point, index) => ({
    gpxFileId,
    giornoId,
    pointIndex: index,
    lat: point.lat,
    lon: point.lon,
    time: point.time,
    elevation: point.elevation,
  }));

  await saveTrackPoints(trackPoints);
  await saveGPXFile(gpxFile);

  return gpxFile;
}

export function parseGPX(text: string): ParsedGPX {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "application/xml");

  if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Invalid GPX XML");
  }

  const trackPoints: ParsedTrackPoint[] = [];
  const tracks = Array.from(xmlDoc.getElementsByTagName("trk"));

  for (const track of tracks) {
    const segments = Array.from(track.getElementsByTagName("trkseg"));

    for (const segment of segments) {
      const points = Array.from(segment.getElementsByTagName("trkpt"));

      for (const point of points) {
        const lat = toNumber(point.getAttribute("lat"));
        const lon = toNumber(point.getAttribute("lon"));
        const elevation = toNumber(point.getElementsByTagName("ele").item(0)?.textContent?.trim());
        const time = point.getElementsByTagName("time").item(0)?.textContent?.trim();

        if (lat === undefined || lon === undefined || elevation === undefined || !time) {
          continue;
        }

        if (Number.isNaN(Date.parse(time))) {
          continue;
        }

        trackPoints.push({
          lat,
          lon,
          time,
          elevation,
        });
      }
    }
  }

  return { trackPoints };
}

export function computeStats(trackPoints: ParsedTrackPoint[]): GPXStats {
  if (trackPoints.length === 0) {
    throw new Error("No track points to compute stats");
  }

  const timestamps = trackPoints
    .map((point) => Date.parse(point.time))
    .filter((value) => !Number.isNaN(value));

  if (timestamps.length === 0) {
    throw new Error("Track points missing valid timestamps");
  }

  const startMs = Math.min(...timestamps);
  const endMs = Math.max(...timestamps);
  const durationMin = Number(((endMs - startMs) / 60000).toFixed(2));

  return {
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
    durationMin,
  };
}

export function createGPXFileRecord(
  file: File,
  stats: GPXStats,
  options: GPXRecordOptions
): GPXFile {
  return {
    id: options.id,
    giornoId: options.giornoId,
    kind: options.kind ?? "actual",
    name: file.name,
    uri: options.uri ?? file.name,
    source: "bmw",
    startTime: stats.startTime,
    endTime: stats.endTime,
    durationMin: stats.durationMin,
    pointsCount: options.pointsCount,
    createdAt: new Date().toISOString(),
  };
}
