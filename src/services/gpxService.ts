import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { GPXFile } from "../models/GPXFile";
import type { Giorno } from "../models/Giorno";
import type { TrackPoint } from "../models/TrackPoint";
import type { Viaggio } from "../models/Viaggio";
import { firebaseAuth } from "../firebase/firebaseAuth";
import { deleteUserDoc, setUserDocMerge } from "../firebase/firestoreHelpers";
import { storage as firebaseStorage } from "../firebase/storage";
import { getClientId } from "./clientIdentity";
import {
  deleteTrackPointsByGpxFileId,
  getGiorno,
  getGiorniByViaggio,
  getViaggi,
  saveGiorno,
  saveGPXFile,
  saveTrackPoints,
  saveViaggio,
} from "./storage";

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
  viaggioId?: string;
  giornoId: string;
  kind?: GPXFile["kind"];
  uri?: string;
  pointsCount: number;
  storagePath?: string;
  downloadUrl?: string;
  rawSizeBytes?: number;
  source?: GPXFile["source"];
}

export interface AutoAssignImportSummary {
  imported: number;
  createdTrips: number;
  createdDays: number;
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

function toLocalDateYmd(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid timestamp for local date conversion");
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateForTripName(dateYmd: string): string {
  const [year, month, day] = dateYmd.split("-");
  if (!year || !month || !day) {
    return dateYmd;
  }
  return `${day}/${month}/${year}`;
}

function parseYmdToMs(dateYmd: string): number {
  const [year, month, day] = dateYmd.split("-").map((value) => Number.parseInt(value, 10));
  if (!year || !month || !day) {
    return Number.NaN;
  }
  return new Date(year, month - 1, day).getTime();
}

function getTripRangeDays(viaggio: Viaggio): number {
  const startMs = parseYmdToMs(viaggio.dataInizio);
  const endMs = parseYmdToMs(viaggio.dataFine);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.round((endMs - startMs) / 86400000) + 1;
}

function chooseBestViaggioForDate(viaggi: Viaggio[], dateYmd: string): Viaggio | undefined {
  const targetMs = parseYmdToMs(dateYmd);
  const matches = viaggi.filter((viaggio) => viaggio.dataInizio <= dateYmd && dateYmd <= viaggio.dataFine);
  if (matches.length === 0) {
    return undefined;
  }

  return [...matches].sort((a, b) => {
    const rangeDelta = getTripRangeDays(a) - getTripRangeDays(b);
    if (rangeDelta !== 0) {
      return rangeDelta;
    }

    const aStartDiff = Math.abs(parseYmdToMs(a.dataInizio) - targetMs);
    const bStartDiff = Math.abs(parseYmdToMs(b.dataInizio) - targetMs);
    if (aStartDiff !== bStartDiff) {
      return aStartDiff - bStartDiff;
    }

    return a.dataInizio.localeCompare(b.dataInizio);
  })[0];
}

function buildNewAutoTrip(dateYmd: string): Viaggio {
  return {
    id: generateId("viaggio"),
    nome: `BMW - ${formatDateForTripName(dateYmd)}`,
    dataInizio: dateYmd,
    dataFine: dateYmd,
    area: "",
    valuta: "EUR",
    stato: "PIANIFICAZIONE",
    createdAt: new Date().toISOString(),
  };
}

function buildNewAutoDay(viaggioId: string, dateYmd: string): Giorno {
  return {
    id: generateId("giorno"),
    viaggioId,
    data: dateYmd,
    titolo: "GIRO BMW",
    stato: "FATTO",
    createdAt: new Date().toISOString(),
  };
}

function deriveLocalDateFromParsed(parsed: ParsedGPX, stats: GPXStats): string {
  if (stats.startTime) {
    return toLocalDateYmd(stats.startTime);
  }

  const firstValidTime = parsed.trackPoints.find((point) => !Number.isNaN(Date.parse(point.time)))?.time;
  if (!firstValidTime) {
    throw new Error("GPX senza timestamp valido per auto-assign");
  }

  return toLocalDateYmd(firstValidTime);
}

function requireAuthenticatedUid(): string {
  const uid = firebaseAuth.currentUser?.uid;
  if (!uid) {
    throw new Error("Utente non autenticato");
  }
  return uid;
}

function buildCloudStoragePath(uid: string, gpxId: string): string {
  return `users/${uid}/gpx/${gpxId}.gpx`;
}

function buildTrackPointsFromParsed(parsed: ParsedGPX, gpxFileId: string, giornoId: string): TrackPoint[] {
  return parsed.trackPoints.map((point, index) => ({
    gpxFileId,
    giornoId,
    pointIndex: index,
    lat: point.lat,
    lon: point.lon,
    time: point.time,
    elevation: point.elevation,
  }));
}

function toCloudSource(source: GPXFile["source"] | undefined): "BMW" | "manual" {
  return source === "manual" ? "manual" : "BMW";
}

async function uploadGpxToCloud(file: File, gpxFileId: string): Promise<{
  storagePath: string;
  downloadUrl?: string;
  rawSizeBytes: number;
}> {
  const uid = requireAuthenticatedUid();
  const storagePath = buildCloudStoragePath(uid, gpxFileId);
  const objectRef = ref(firebaseStorage, storagePath);

  await uploadBytes(objectRef, file);

  let downloadUrl: string | undefined;
  try {
    downloadUrl = await getDownloadURL(objectRef);
  } catch (error) {
    console.warn("Unable to resolve GPX download URL after upload", error);
  }

  return {
    storagePath,
    downloadUrl,
    rawSizeBytes: file.size,
  };
}

async function saveGpxMetadataToCloud(gpxFile: GPXFile): Promise<void> {
  const nowIso = new Date().toISOString();
  const updatedAt = gpxFile.updatedAt ?? nowIso;

  await setUserDocMerge("gpxFiles", gpxFile.id, {
    id: gpxFile.id,
    viaggioId: gpxFile.viaggioId,
    giornoId: gpxFile.giornoId,
    filename: gpxFile.filename ?? gpxFile.name,
    name: gpxFile.name,
    kind: gpxFile.kind,
    uri: gpxFile.uri,
    storagePath: gpxFile.storagePath,
    downloadUrl: gpxFile.downloadUrl,
    rawSizeBytes: gpxFile.rawSizeBytes,
    startTime: gpxFile.startTime,
    endTime: gpxFile.endTime,
    durationMin: gpxFile.durationMin,
    pointsCount: gpxFile.pointsCount,
    source: toCloudSource(gpxFile.source),
    createdAt: gpxFile.createdAt,
    updatedAt,
    _clientId: getClientId(),
  });
}

async function persistParsedGpxToGiorno(file: File, giornoId: string, parsed: ParsedGPX, stats: GPXStats): Promise<GPXFile> {
  const gpxFileId = generateId("gpx");
  const giorno = await getGiorno(giornoId);
  const uploadResult = await uploadGpxToCloud(file, gpxFileId);
  const gpxFile = createGPXFileRecord(file, stats, {
    id: gpxFileId,
    viaggioId: giorno?.viaggioId,
    giornoId,
    pointsCount: parsed.trackPoints.length,
    storagePath: uploadResult.storagePath,
    downloadUrl: uploadResult.downloadUrl,
    rawSizeBytes: uploadResult.rawSizeBytes,
  });
  const trackPoints = buildTrackPointsFromParsed(parsed, gpxFileId, giornoId);

  await saveGpxMetadataToCloud(gpxFile);
  await saveTrackPoints(trackPoints);
  await saveGPXFile(gpxFile, { skipCloud: true });

  return gpxFile;
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

  const stats = computeStats(parsed.trackPoints);
  return persistParsedGpxToGiorno(file, giornoId, parsed, stats);
}

export async function importBmwGpxAndAutoAssign(files: File[]): Promise<AutoAssignImportSummary> {
  const validFiles = files.filter((file) => file instanceof File);
  if (validFiles.length === 0) {
    return { imported: 0, createdTrips: 0, createdDays: 0 };
  }

  const viaggi = await getViaggi();
  const giorniByViaggioCache = new Map<string, Giorno[]>();
  let createdTrips = 0;
  let createdDays = 0;
  let imported = 0;

  for (const file of validFiles) {
    const text = await file.text();
    const parsed = parseGPX(text);
    if (parsed.trackPoints.length === 0) {
      throw new Error(`Nessun trackpoint BMW valido in ${file.name}`);
    }

    const stats = computeStats(parsed.trackPoints);
    const dateYmd = deriveLocalDateFromParsed(parsed, stats);

    let viaggio = chooseBestViaggioForDate(viaggi, dateYmd);
    if (!viaggio) {
      viaggio = buildNewAutoTrip(dateYmd);
      await saveViaggio(viaggio);
      viaggi.push(viaggio);
      giorniByViaggioCache.set(viaggio.id, []);
      createdTrips += 1;
    }

    let giorni = giorniByViaggioCache.get(viaggio.id);
    if (!giorni) {
      giorni = await getGiorniByViaggio(viaggio.id);
      giorniByViaggioCache.set(viaggio.id, giorni);
    }

    let giorno = giorni.find((item) => item.data === dateYmd);
    if (!giorno) {
      giorno = buildNewAutoDay(viaggio.id, dateYmd);
      await saveGiorno(giorno);
      giorni.push(giorno);
      createdDays += 1;
    }

    await persistParsedGpxToGiorno(file, giorno.id, parsed, stats);
    imported += 1;
  }

  return { imported, createdTrips, createdDays };
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
  const nowIso = new Date().toISOString();
  return {
    id: options.id,
    viaggioId: options.viaggioId,
    giornoId: options.giornoId,
    kind: options.kind ?? "actual",
    name: file.name,
    filename: file.name,
    uri: options.uri ?? file.name,
    source: options.source ?? "bmw",
    startTime: stats.startTime,
    endTime: stats.endTime,
    durationMin: stats.durationMin,
    pointsCount: options.pointsCount,
    storagePath: options.storagePath,
    downloadUrl: options.downloadUrl,
    rawSizeBytes: options.rawSizeBytes,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export async function deleteGpxFileFromCloud(gpxFile: GPXFile): Promise<void> {
  if (!firebaseAuth.currentUser) {
    return;
  }

  await deleteUserDoc("gpxFiles", gpxFile.id);

  const storagePath = gpxFile.storagePath?.trim();
  if (!storagePath) {
    return;
  }

  try {
    await deleteObject(ref(firebaseStorage, storagePath));
  } catch (error) {
    console.warn(`GPX storage delete failed for ${storagePath}`, error);
  }
}

export async function recoverGpxTrackPointsFromCloud(gpxFiles: GPXFile[]): Promise<number> {
  let recovered = 0;

  for (const gpxFile of gpxFiles) {
    const storagePath = gpxFile.storagePath?.trim();
    if (!storagePath) {
      continue;
    }

    const objectRef = ref(firebaseStorage, storagePath);
    const downloadUrl = await getDownloadURL(objectRef);
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Download GPX fallito (${response.status})`);
    }

    const text = await response.text();
    const parsed = parseGPX(text);
    if (parsed.trackPoints.length === 0) {
      throw new Error(`GPX remoto senza trackpoint validi (${gpxFile.name})`);
    }

    await deleteTrackPointsByGpxFileId(gpxFile.id);
    await saveTrackPoints(buildTrackPointsFromParsed(parsed, gpxFile.id, gpxFile.giornoId));
    await saveGPXFile(
      {
        ...gpxFile,
        filename: gpxFile.filename ?? gpxFile.name,
        name: gpxFile.name || gpxFile.filename || "GPX",
        downloadUrl,
      },
      { skipCloud: true },
    );

    recovered += 1;
  }

  return recovered;
}
