import type { Giorno } from "../models/Giorno";
import type { GPXFile } from "../models/GPXFile";
import type { TrackPoint } from "../models/TrackPoint";
import type { Viaggio } from "../models/Viaggio";

const DB_NAME = "RideManagerDB";
const DB_VERSION = 4;

const STORE_VIAGGI = "viaggi";
const STORE_GIORNI = "giorni";
const STORE_GPX_FILES = "gpxFiles";
const STORE_TRACK_POINTS = "trackPoints";
const DEFAULT_VIAGGIO_STATO: Viaggio["stato"] = "PIANIFICAZIONE";
const DEFAULT_GIORNO_STATO: Giorno["stato"] = "PIANIFICATO";
const VIAGGIO_STATI: Viaggio["stato"][] = [
  "PIANIFICAZIONE",
  "ATTIVO",
  "CONCLUSO",
  "ARCHIVIATO",
];
const GIORNO_STATI: Giorno["stato"][] = ["PIANIFICATO", "IN_CORSO", "FATTO"];

type StoreName =
  | typeof STORE_VIAGGI
  | typeof STORE_GIORNI
  | typeof STORE_GPX_FILES
  | typeof STORE_TRACK_POINTS;

type LegacyViaggioRecord = Partial<Viaggio> & { id: string; titolo?: string };
type LegacyGiornoRecord = Partial<Giorno> & { id: string; viaggioId?: string };

let dbPromise: Promise<IDBDatabase> | null = null;

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isViaggioStato(value: unknown): value is Viaggio["stato"] {
  return typeof value === "string" && VIAGGIO_STATI.includes(value as Viaggio["stato"]);
}

function isGiornoStato(value: unknown): value is Giorno["stato"] {
  return typeof value === "string" && GIORNO_STATI.includes(value as Giorno["stato"]);
}

function normalizeViaggio(record: LegacyViaggioRecord): Viaggio {
  const nome =
    typeof record.nome === "string"
      ? record.nome
      : typeof record.titolo === "string"
        ? record.titolo
        : "";
  const dataInizio =
    typeof record.dataInizio === "string" && record.dataInizio ? record.dataInizio : todayDate();
  const dataFine =
    typeof record.dataFine === "string" && record.dataFine ? record.dataFine : dataInizio;

  return {
    id: record.id,
    nome,
    dataInizio,
    dataFine,
    area: typeof record.area === "string" ? record.area : "",
    valuta: "EUR",
    stato: isViaggioStato(record.stato) ? record.stato : DEFAULT_VIAGGIO_STATO,
    note: typeof record.note === "string" ? record.note : undefined,
    createdAt:
      typeof record.createdAt === "string" && record.createdAt
        ? record.createdAt
        : new Date().toISOString(),
  };
}

function normalizeGiorno(record: LegacyGiornoRecord): Giorno {
  return {
    id: record.id,
    viaggioId: typeof record.viaggioId === "string" ? record.viaggioId : "",
    data: typeof record.data === "string" && record.data ? record.data : todayDate(),
    titolo: typeof record.titolo === "string" ? record.titolo : "",
    stato: isGiornoStato(record.stato) ? record.stato : DEFAULT_GIORNO_STATO,
    note: typeof record.note === "string" ? record.note : undefined,
    createdAt:
      typeof record.createdAt === "string" && record.createdAt
        ? record.createdAt
        : new Date().toISOString(),
  };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

async function putRecord<T>(storeName: StoreName, value: T): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionToPromise(transaction);
}

async function getAllRecords<T>(storeName: StoreName): Promise<T[]> {
  const db = await initDB();
  const transaction = db.transaction(storeName, "readonly");
  const request = transaction.objectStore(storeName).getAll();
  const records = await requestToPromise(request);
  await transactionToPromise(transaction);
  return records as T[];
}

export function initDB(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_VIAGGI)) {
        db.createObjectStore(STORE_VIAGGI, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORE_GIORNI)) {
        db.createObjectStore(STORE_GIORNI, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORE_GPX_FILES)) {
        db.createObjectStore(STORE_GPX_FILES, { keyPath: "id" });
      }

      if (db.objectStoreNames.contains(STORE_TRACK_POINTS)) {
        db.deleteObjectStore(STORE_TRACK_POINTS);
      }

      db.createObjectStore(STORE_TRACK_POINTS, { keyPath: "id", autoIncrement: true });
    };

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };

      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error("Unable to open IndexedDB"));
    };

    request.onblocked = () => {
      reject(new Error("IndexedDB open request blocked"));
    };
  });

  return dbPromise;
}

export async function saveViaggio(viaggio: Viaggio): Promise<void> {
  await putRecord(STORE_VIAGGI, normalizeViaggio(viaggio));
}

export async function getViaggi(): Promise<Viaggio[]> {
  const viaggi = await getAllRecords<LegacyViaggioRecord>(STORE_VIAGGI);
  return viaggi.map((viaggio) => normalizeViaggio(viaggio));
}

export async function saveGiorno(giorno: Giorno): Promise<void> {
  await putRecord(STORE_GIORNI, normalizeGiorno(giorno));
}

export async function getGiorniByViaggio(viaggioId: string): Promise<Giorno[]> {
  const giorni = await getAllRecords<LegacyGiornoRecord>(STORE_GIORNI);
  return giorni
    .map((giorno) => normalizeGiorno(giorno))
    .filter((giorno) => giorno.viaggioId === viaggioId);
}

export async function saveGPXFile(gpxFile: GPXFile): Promise<void> {
  await putRecord(STORE_GPX_FILES, gpxFile);
}

export async function getGPXFilesByGiorno(giornoId: string): Promise<GPXFile[]> {
  const gpxFiles = await getAllRecords<GPXFile>(STORE_GPX_FILES);
  return gpxFiles.filter((gpxFile) => gpxFile.giornoId === giornoId);
}

export async function deleteGPXFile(gpxFileId: string): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(STORE_GPX_FILES, "readwrite");
  transaction.objectStore(STORE_GPX_FILES).delete(gpxFileId);
  await transactionToPromise(transaction);
}

export async function saveTrackPoints(trackPoints: TrackPoint[]): Promise<void> {
  if (trackPoints.length === 0) {
    return;
  }

  const db = await initDB();
  const transaction = db.transaction(STORE_TRACK_POINTS, "readwrite");
  const store = transaction.objectStore(STORE_TRACK_POINTS);

  for (const trackPoint of trackPoints) {
    store.add(trackPoint);
  }

  await transactionToPromise(transaction);
}

export async function getTrackPoints(): Promise<TrackPoint[]> {
  return getAllRecords<TrackPoint>(STORE_TRACK_POINTS);
}

export async function getTrackPointsByGiorno(giornoId: string): Promise<TrackPoint[]> {
  const trackPoints = await getTrackPoints();
  return trackPoints.filter((trackPoint) => trackPoint.giornoId === giornoId);
}

export async function deleteTrackPointsByGpxFileId(gpxFileId: string): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(STORE_TRACK_POINTS, "readwrite");
  const store = transaction.objectStore(STORE_TRACK_POINTS);
  const allTrackPoints = await requestToPromise(store.getAll());

  for (const trackPoint of allTrackPoints as TrackPoint[]) {
    if (trackPoint.gpxFileId === gpxFileId && typeof trackPoint.id === "number") {
      store.delete(trackPoint.id);
    }
  }

  await transactionToPromise(transaction);
}

export async function deleteTrackPointsByGiornoId(giornoId: string): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(STORE_TRACK_POINTS, "readwrite");
  const store = transaction.objectStore(STORE_TRACK_POINTS);
  const allTrackPoints = await requestToPromise(store.getAll());

  for (const trackPoint of allTrackPoints as TrackPoint[]) {
    if (trackPoint.giornoId === giornoId && typeof trackPoint.id === "number") {
      store.delete(trackPoint.id);
    }
  }

  await transactionToPromise(transaction);
}

export async function deleteGpxFilesByGiornoId(giornoId: string): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(STORE_GPX_FILES, "readwrite");
  const store = transaction.objectStore(STORE_GPX_FILES);
  const allGpxFiles = await requestToPromise(store.getAll());

  for (const gpxFile of allGpxFiles as GPXFile[]) {
    if (gpxFile.giornoId === giornoId) {
      store.delete(gpxFile.id);
    }
  }

  await transactionToPromise(transaction);
}

export async function deleteGiorno(giornoId: string): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(STORE_GIORNI, "readwrite");
  transaction.objectStore(STORE_GIORNI).delete(giornoId);
  await transactionToPromise(transaction);
}
