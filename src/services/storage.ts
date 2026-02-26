import type { Costo, CostoCategoria } from "../models/Costo";
import type { DayPlanSegment, Giorno } from "../models/Giorno";
import type { GPXFile } from "../models/GPXFile";
import type { ImpostazioniApp, Partecipante } from "../models/ImpostazioniApp";
import type { Prenotazione, PrenotazioneStato, PrenotazioneTipo } from "../models/Prenotazione";
import type { TrackPoint } from "../models/TrackPoint";
import type { Viaggio } from "../models/Viaggio";

const DB_NAME = "RideManagerDB";
const DB_VERSION = 8;

const STORE_VIAGGI = "viaggi";
const STORE_GIORNI = "giorni";
const STORE_GPX_FILES = "gpxFiles";
const STORE_TRACK_POINTS = "trackPoints";
const STORE_PRENOTAZIONI = "prenotazioni";
const STORE_COSTI = "costi";
const STORE_IMPOSTAZIONI = "impostazioni";
const STORE_OUTBOX = "outbox";
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
  | typeof STORE_TRACK_POINTS
  | typeof STORE_PRENOTAZIONI
  | typeof STORE_COSTI
  | typeof STORE_IMPOSTAZIONI
  | typeof STORE_OUTBOX;

const BACKUP_STORES: StoreName[] = [
  STORE_VIAGGI,
  STORE_GIORNI,
  STORE_GPX_FILES,
  STORE_TRACK_POINTS,
  STORE_PRENOTAZIONI,
  STORE_COSTI,
  STORE_IMPOSTAZIONI,
];

export interface BackupMeta {
  schemaVersion: number;
  createdAt: string;
  dbName: string;
  dbVersion: number;
}

export interface BackupPayload {
  meta: BackupMeta;
  data: {
    viaggi: unknown[];
    giorni: unknown[];
    gpxFiles: unknown[];
    trackPoints: unknown[];
    prenotazioni: unknown[];
    costi: unknown[];
    impostazioni: unknown[];
  };
}

export type CloudSyncCollectionName =
  | "viaggi"
  | "giorni"
  | "gpxFiles"
  | "prenotazioni"
  | "costi"
  | "viaggi_index"
  | "giorni_index"
  | "costi_index"
  | "prenotazioni_index";

export type OutboxOp = "set" | "del";

export interface OutboxRecord {
  id: string;
  ts: string;
  op: OutboxOp;
  collection: CloudSyncCollectionName;
  docId: string;
  payload?: unknown;
}

export interface CloudMirrorOptions {
  skipCloud?: boolean;
}

export type RealtimeDataCollectionName = Extract<
  CloudSyncCollectionName,
  "viaggi" | "giorni" | "gpxFiles" | "prenotazioni" | "costi"
>;

type LegacyViaggioRecord = Partial<Viaggio> & { id: string; titolo?: string };
type LegacyGiornoRecord = Partial<Giorno> & { id: string; viaggioId?: string };
type LegacyPrenotazioneRecord = Partial<Prenotazione> & {
  id: string;
  viaggioId?: string;
  tipo?: string;
  stato?: string;
};
type LegacyCostoRecord = Partial<Costo> & {
  id: string;
  viaggioId?: string;
  categoria?: string;
  pagatoDa?: string;
};
type LegacyPartecipanteRecord = Partial<Partecipante> & { id?: string };
type LegacyImpostazioniAppRecord = Partial<ImpostazioniApp> & {
  id?: string;
  partecipanti?: LegacyPartecipanteRecord[];
};

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

function isPlannedRouteMode(value: unknown): value is "direct" | "curvy" {
  return value === "direct" || value === "curvy";
}

function isPrenotazioneTipo(value: unknown): value is PrenotazioneTipo {
  return value === "HOTEL" || value === "TRAGHETTO";
}

function isPrenotazioneStato(value: unknown): value is PrenotazioneStato {
  return value === "OPZIONE" || value === "CONFERMATA" || value === "CANCELLATA";
}

function isCostoCategoria(value: unknown): value is CostoCategoria {
  return (
    value === "BENZINA" ||
    value === "PEDAGGI" ||
    value === "PRANZO" ||
    value === "CENA" ||
    value === "HOTEL" ||
    value === "TRAGHETTI" ||
    value === "EXTRA"
  );
}

function toValidIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function withHiddenSyncMetadata<T extends object>(target: T, source: unknown): T {
  const record = isRecord(source) ? source : null;
  const updatedAt = toValidIso(record?.updatedAt) ?? new Date().toISOString();
  const clientId = toOptionalString(record?._clientId);

  return {
    ...target,
    updatedAt,
    ...(clientId ? { _clientId: clientId } : {}),
  } as T;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function normalizeTripParticipants(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const partecipanti = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 6);

  return partecipanti.length > 0 ? partecipanti : undefined;
}

function normalizePlannedRoute(value: unknown): Giorno["plannedRoute"] | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as {
    engine?: unknown;
    modeRequested?: unknown;
    modeApplied?: unknown;
    source?: unknown;
    pointsText?: unknown;
    expandedUrl?: unknown;
    distanceKm?: unknown;
    durationMin?: unknown;
    geometry?: unknown;
    createdAt?: unknown;
  };

  if (record.engine !== "osrm") {
    return undefined;
  }

  if (!isPlannedRouteMode(record.modeRequested) || !isPlannedRouteMode(record.modeApplied)) {
    return undefined;
  }

  if (
    typeof record.distanceKm !== "number" ||
    !Number.isFinite(record.distanceKm) ||
    record.distanceKm < 0
  ) {
    return undefined;
  }

  if (
    typeof record.durationMin !== "number" ||
    !Number.isFinite(record.durationMin) ||
    record.durationMin < 0
  ) {
    return undefined;
  }

  if (!Array.isArray(record.geometry)) {
    return undefined;
  }

  const geometry: { lat: number; lon: number }[] = [];
  for (const point of record.geometry) {
    if (typeof point !== "object" || point === null) {
      return undefined;
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
      return undefined;
    }

    geometry.push({ lat, lon });
  }

  if (geometry.length < 2) {
    return undefined;
  }

  const createdAt = toValidIso(record.createdAt);
  if (!createdAt) {
    return undefined;
  }

  const source =
    record.source === "osrm-text" || record.source === "google-link"
      ? record.source
      : undefined;
  const pointsText = Array.isArray(record.pointsText)
    ? record.pointsText
        .map((point) => toOptionalString(point))
        .filter((point): point is string => Boolean(point))
    : undefined;
  const expandedUrl = toOptionalString(record.expandedUrl);

  return {
    engine: "osrm",
    modeRequested: record.modeRequested,
    modeApplied: record.modeApplied,
    source,
    pointsText: pointsText && pointsText.length >= 2 ? pointsText : undefined,
    expandedUrl,
    distanceKm: record.distanceKm,
    durationMin: record.durationMin,
    geometry,
    createdAt,
  };
}

function normalizeDayPlanSegment(value: unknown): DayPlanSegment | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = toOptionalString(record.id);
  if (!id) {
    return null;
  }

  if (record.type === "RIDE") {
    const modeRequested = isPlannedRouteMode(record.modeRequested) ? record.modeRequested : "direct";
    const modeApplied = isPlannedRouteMode(record.modeApplied) ? record.modeApplied : undefined;
    const distanceKm = toOptionalNumber(record.distanceKm);
    const durationMin = toOptionalNumber(record.durationMin);
    const geometry = Array.isArray(record.geometry)
      ? record.geometry
          .map((point) => {
            if (typeof point !== "object" || point === null) {
              return null;
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
              return null;
            }
            return { lat, lon };
          })
          .filter((point): point is { lat: number; lon: number } => point !== null)
      : undefined;

    return {
      id,
      type: "RIDE",
      originText: typeof record.originText === "string" ? record.originText : "",
      destinationText: typeof record.destinationText === "string" ? record.destinationText : "",
      modeRequested,
      modeApplied,
      distanceKm,
      durationMin,
      geometry: geometry && geometry.length >= 2 ? geometry : undefined,
    };
  }

  if (record.type === "FERRY") {
    return {
      id,
      type: "FERRY",
      prenotazioneId: toOptionalString(record.prenotazioneId),
      departPortText: toOptionalString(record.departPortText),
      arrivePortText: toOptionalString(record.arrivePortText),
      company: toOptionalString(record.company),
      note: toOptionalString(record.note),
    };
  }

  return null;
}

function normalizeDayPlan(value: unknown): Giorno["dayPlan"] | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const rawSegments = Array.isArray(record.segments) ? record.segments : [];
  const segments = rawSegments
    .map((segment) => normalizeDayPlanSegment(segment))
    .filter((segment): segment is NonNullable<ReturnType<typeof normalizeDayPlanSegment>> => segment !== null);

  const boardingBufferMinRaw = toOptionalNumber(record.boardingBufferMin);
  const boardingBufferMin =
    boardingBufferMinRaw !== undefined && boardingBufferMinRaw >= 0
      ? Math.round(boardingBufferMinRaw)
      : 45;

  return {
    segments,
    boardingBufferMin,
    createdAt: toValidIso(record.createdAt) ?? nowIso,
    updatedAt: toValidIso(record.updatedAt) ?? nowIso,
  };
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
    partecipanti: normalizeTripParticipants((record as { partecipanti?: unknown }).partecipanti),
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
    hotelPrenotazioneId: toOptionalString(record.hotelPrenotazioneId),
    plannedMapsUrl: toOptionalString(record.plannedMapsUrl),
    plannedOriginText: toOptionalString(record.plannedOriginText),
    plannedDestinationText: toOptionalString(record.plannedDestinationText),
    plannedRoute: normalizePlannedRoute(record.plannedRoute),
    dayPlan: normalizeDayPlan(record.dayPlan),
    createdAt:
      typeof record.createdAt === "string" && record.createdAt
        ? record.createdAt
        : new Date().toISOString(),
  };
}

function normalizePrenotazione(record: LegacyPrenotazioneRecord): Prenotazione | null {
  if (!isPrenotazioneTipo(record.tipo)) {
    console.warn("Prenotazione scartata: tipo non valido", record);
    return null;
  }

  const nowIso = new Date().toISOString();
  const dataInizio = toValidIso(record.dataInizio);
  if (!dataInizio) {
    console.warn("Prenotazione scartata: dataInizio non valida", record);
    return null;
  }

  return {
    id: record.id,
    viaggioId: typeof record.viaggioId === "string" ? record.viaggioId : "",
    giornoId: toOptionalString(record.giornoId),
    tipo: record.tipo,
    stato: isPrenotazioneStato(record.stato) ? record.stato : "OPZIONE",
    titolo: typeof record.titolo === "string" ? record.titolo : "",
    fornitore: toOptionalString(record.fornitore),
    localita: toOptionalString(record.localita),
    dataInizio,
    dataFine: toValidIso(record.dataFine) ?? undefined,
    oraInizio: toOptionalString(record.oraInizio),
    oraFine: toOptionalString(record.oraFine),
    indirizzo: toOptionalString(record.indirizzo),
    checkIn: toOptionalString(record.checkIn),
    checkOut: toOptionalString(record.checkOut),
    ospiti: toOptionalNumber(record.ospiti),
    camere: toOptionalNumber(record.camere),
    parcheggioMoto: toOptionalBoolean(record.parcheggioMoto),
    colazioneInclusa: toOptionalBoolean(record.colazioneInclusa),
    portoPartenza: toOptionalString(record.portoPartenza),
    portoArrivo: toOptionalString(record.portoArrivo),
    compagnia: toOptionalString(record.compagnia),
    nave: toOptionalString(record.nave),
    cabina: toOptionalString(record.cabina),
    veicolo:
      record.veicolo === "MOTO" || record.veicolo === "AUTO" || record.veicolo === "ALTRO"
        ? record.veicolo
        : undefined,
    targaVeicolo: toOptionalString(record.targaVeicolo),
    passeggeri: toOptionalNumber(record.passeggeri),
    numeroPrenotazione: toOptionalString(record.numeroPrenotazione),
    url: toOptionalString(record.url),
    email: toOptionalString(record.email),
    telefono: toOptionalString(record.telefono),
    valuta: "EUR",
    costoTotale: toOptionalNumber(record.costoTotale),
    caparra: toOptionalNumber(record.caparra),
    pagato: toOptionalBoolean(record.pagato),
    pagatoDa: toOptionalString(record.pagatoDa) as Prenotazione["pagatoDa"] | undefined,
    quotaIo: toOptionalNumber(record.quotaIo),
    quotaLei: toOptionalNumber(record.quotaLei),
    note: toOptionalString(record.note),
    createdAt: toValidIso(record.createdAt) ?? nowIso,
    updatedAt: toValidIso(record.updatedAt) ?? nowIso,
  };
}

function normalizeCosto(record: LegacyCostoRecord): Costo | null {
  const nowIso = new Date().toISOString();
  const data = toValidIso(record.data);
  if (!data) {
    console.warn("Costo scartato: data non valida", record);
    return null;
  }

  const importo = toOptionalNumber(record.importo);
  if (importo === undefined) {
    console.warn("Costo scartato: importo non valido", record);
    return null;
  }

  if (!isCostoCategoria(record.categoria)) {
    console.warn("Costo scartato: categoria non valida", record);
    return null;
  }

  return {
    id: record.id,
    viaggioId: typeof record.viaggioId === "string" ? record.viaggioId : "",
    giornoId: toOptionalString(record.giornoId),
    categoria: record.categoria,
    titolo: typeof record.titolo === "string" ? record.titolo : "",
    data,
    ora: toOptionalString(record.ora),
    valuta: "EUR",
    importo,
    litri: toOptionalNumber(record.litri),
    prezzoLitro: toOptionalNumber(record.prezzoLitro),
    pagatoDa: (toOptionalString(record.pagatoDa) ?? "IO") as Costo["pagatoDa"],
    quotaIo: toOptionalNumber(record.quotaIo),
    quotaLei: toOptionalNumber(record.quotaLei),
    note: toOptionalString(record.note),
    createdAt: toValidIso(record.createdAt) ?? nowIso,
    updatedAt: toValidIso(record.updatedAt) ?? nowIso,
  };
}

function normalizeImpostazioniApp(
  record: LegacyImpostazioniAppRecord,
): ImpostazioniApp | null {
  if (record.id !== "app") {
    console.warn("Impostazioni scartate: id non valido", record);
    return null;
  }

  const nowIso = new Date().toISOString();
  const partecipantiRaw = Array.isArray(record.partecipanti) ? record.partecipanti : [];
  const partecipanti: Partecipante[] = partecipantiRaw
    .map((item, index) => {
      const id =
        typeof item?.id === "string" && item.id.trim()
          ? item.id
          : `p_${index + 1}`;
      const nome = typeof item?.nome === "string" ? item.nome.trim() : "";
      return { id, nome };
    })
    .filter((item) => item.id.trim().length > 0);

  return {
    id: "app",
    partecipanti,
    createdAt: toValidIso(record.createdAt) ?? nowIso,
    updatedAt: toValidIso(record.updatedAt) ?? nowIso,
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

async function countRecords(storeName: StoreName): Promise<number> {
  const db = await initDB();
  const transaction = db.transaction(storeName, "readonly");
  const request = transaction.objectStore(storeName).count();
  const count = await requestToPromise(request);
  await transactionToPromise(transaction);
  return count;
}

async function getRecordByIdRaw(storeName: StoreName, id: string): Promise<unknown | undefined> {
  const db = await initDB();
  const transaction = db.transaction(storeName, "readonly");
  const request = transaction.objectStore(storeName).get(id);
  const record = await requestToPromise(request);
  await transactionToPromise(transaction);
  return record ?? undefined;
}

function runCloudMirrorTask(task: Promise<unknown>): void {
  void task.catch((error) => {
    console.warn("Cloud sync mirror failed", error);
  });
}

async function mirrorCloudUpsert(
  collection: CloudSyncCollectionName,
  docId: string,
  payload: unknown,
): Promise<void> {
  const { cloudUpsert } = await import("./cloudSync");
  await cloudUpsert(collection, docId, payload);
}

async function mirrorCloudDelete(collection: CloudSyncCollectionName, docId: string): Promise<void> {
  const { cloudDelete } = await import("./cloudSync");
  await cloudDelete(collection, docId);
}

function buildViaggioIndexRecord(viaggio: Viaggio): Record<string, unknown> {
  return {
    id: viaggio.id,
    nome: viaggio.nome,
    dataInizio: viaggio.dataInizio,
    dataFine: viaggio.dataFine,
    stato: viaggio.stato,
    valuta: viaggio.valuta,
    updatedAt: new Date().toISOString(),
  };
}

function buildGiornoIndexRecord(giorno: Giorno): Record<string, unknown> {
  return {
    id: giorno.id,
    viaggioId: giorno.viaggioId,
    data: giorno.data,
    titolo: giorno.titolo,
    stato: giorno.stato,
    createdAt: giorno.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

function buildCostoIndexRecord(costo: Costo): Record<string, unknown> {
  return {
    id: costo.id,
    viaggioId: costo.viaggioId,
    giornoId: costo.giornoId,
    categoria: costo.categoria,
    titolo: costo.titolo,
    data: costo.data,
    importo: costo.importo,
    valuta: costo.valuta,
    pagatoDa: costo.pagatoDa,
    updatedAt: costo.updatedAt,
  };
}

function buildPrenotazioneIndexRecord(prenotazione: Prenotazione): Record<string, unknown> {
  return {
    id: prenotazione.id,
    viaggioId: prenotazione.viaggioId,
    giornoId: prenotazione.giornoId,
    tipo: prenotazione.tipo,
    titolo: prenotazione.titolo,
    dataInizio: prenotazione.dataInizio,
    dataFine: prenotazione.dataFine,
    costoTotale: prenotazione.costoTotale,
    valuta: prenotazione.valuta,
    pagato: prenotazione.pagato,
    pagatoDa: prenotazione.pagatoDa,
    stato: prenotazione.stato,
    updatedAt: prenotazione.updatedAt,
  };
}

function createOutboxId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

      if (!db.objectStoreNames.contains(STORE_TRACK_POINTS)) {
        db.createObjectStore(STORE_TRACK_POINTS, { keyPath: "id", autoIncrement: true });
      }

      if (!db.objectStoreNames.contains(STORE_PRENOTAZIONI)) {
        db.createObjectStore(STORE_PRENOTAZIONI, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORE_COSTI)) {
        db.createObjectStore(STORE_COSTI, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORE_IMPOSTAZIONI)) {
        db.createObjectStore(STORE_IMPOSTAZIONI, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        db.createObjectStore(STORE_OUTBOX, { keyPath: "id" });
      }
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

export async function enqueueOutbox(
  op: OutboxOp,
  collection: CloudSyncCollectionName,
  docId: string,
  payload?: unknown,
): Promise<OutboxRecord> {
  const record: OutboxRecord = {
    id: createOutboxId(),
    ts: new Date().toISOString(),
    op,
    collection,
    docId,
    payload,
  };

  const db = await initDB();
  const transaction = db.transaction(STORE_OUTBOX, "readwrite");
  const store = transaction.objectStore(STORE_OUTBOX);
  const existing = await requestToPromise(store.getAll());

  for (const item of existing as OutboxRecord[]) {
    if (item.collection === collection && item.docId === docId) {
      store.delete(item.id);
    }
  }

  store.put(record);
  await transactionToPromise(transaction);
  return record;
}

export async function listOutbox(): Promise<OutboxRecord[]> {
  const records = await getAllRecords<OutboxRecord>(STORE_OUTBOX);
  return records.sort((a, b) => {
    if (a.ts === b.ts) {
      return a.id.localeCompare(b.id);
    }

    return a.ts.localeCompare(b.ts);
  });
}

export async function hasPendingOutboxEntry(
  collection: CloudSyncCollectionName,
  docId: string,
): Promise<boolean> {
  const records = await getAllRecords<OutboxRecord>(STORE_OUTBOX);
  return records.some((item) => item.collection === collection && item.docId === docId);
}

export async function removeOutbox(id: string): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(STORE_OUTBOX, "readwrite");
  transaction.objectStore(STORE_OUTBOX).delete(id);
  await transactionToPromise(transaction);
}

export async function saveViaggio(viaggio: Viaggio, opts?: CloudMirrorOptions): Promise<void> {
  const normalized = normalizeViaggio(viaggio);
  await putRecord(STORE_VIAGGI, withHiddenSyncMetadata(normalized, viaggio));
  if (opts?.skipCloud) {
    return;
  }
  runCloudMirrorTask(mirrorCloudUpsert("viaggi", normalized.id, normalized));
  runCloudMirrorTask(mirrorCloudUpsert("viaggi_index", normalized.id, buildViaggioIndexRecord(normalized)));
}

export async function getViaggi(): Promise<Viaggio[]> {
  const viaggi = await getAllRecords<LegacyViaggioRecord>(STORE_VIAGGI);
  return viaggi.map((viaggio) => normalizeViaggio(viaggio));
}

export async function getViaggiRecordCount(): Promise<number> {
  return countRecords(STORE_VIAGGI);
}

export async function getCloudSyncRecordRaw(
  collection: RealtimeDataCollectionName,
  docId: string,
): Promise<Record<string, unknown> | undefined> {
  const storeName: StoreName =
    collection === "viaggi"
      ? STORE_VIAGGI
      : collection === "giorni"
        ? STORE_GIORNI
        : collection === "gpxFiles"
          ? STORE_GPX_FILES
        : collection === "prenotazioni"
          ? STORE_PRENOTAZIONI
          : STORE_COSTI;

  const record = await getRecordByIdRaw(storeName, docId);
  return isRecord(record) ? record : undefined;
}

export async function getViaggioById(viaggioId: string): Promise<Viaggio | undefined> {
  const db = await initDB();
  const transaction = db.transaction(STORE_VIAGGI, "readonly");
  const request = transaction.objectStore(STORE_VIAGGI).get(viaggioId);
  const rawRecord = await requestToPromise(request);
  await transactionToPromise(transaction);

  if (!rawRecord) {
    return undefined;
  }

  return normalizeViaggio(rawRecord as LegacyViaggioRecord);
}

export async function saveGiorno(giorno: Giorno, opts?: CloudMirrorOptions): Promise<void> {
  const normalized = normalizeGiorno(giorno);
  await putRecord(STORE_GIORNI, withHiddenSyncMetadata(normalized, giorno));
  if (opts?.skipCloud) {
    return;
  }
  runCloudMirrorTask(mirrorCloudUpsert("giorni", normalized.id, normalized));
  runCloudMirrorTask(mirrorCloudUpsert("giorni_index", normalized.id, buildGiornoIndexRecord(normalized)));
}

export async function getGiorniByViaggio(viaggioId: string): Promise<Giorno[]> {
  const giorni = await getAllRecords<LegacyGiornoRecord>(STORE_GIORNI);
  return giorni
    .map((giorno) => normalizeGiorno(giorno))
    .filter((giorno) => giorno.viaggioId === viaggioId);
}

export async function getGiorno(giornoId: string): Promise<Giorno | undefined> {
  const db = await initDB();
  const transaction = db.transaction(STORE_GIORNI, "readonly");
  const request = transaction.objectStore(STORE_GIORNI).get(giornoId);
  const rawRecord = await requestToPromise(request);
  await transactionToPromise(transaction);

  if (!rawRecord) {
    return undefined;
  }

  return normalizeGiorno(rawRecord as LegacyGiornoRecord);
}

export async function saveGPXFile(gpxFile: GPXFile, _opts?: CloudMirrorOptions): Promise<void> {
  await putRecord(STORE_GPX_FILES, withHiddenSyncMetadata(gpxFile, gpxFile));
}

export async function getGPXFilesByGiorno(giornoId: string): Promise<GPXFile[]> {
  const gpxFiles = await getAllRecords<GPXFile>(STORE_GPX_FILES);
  return gpxFiles.filter((gpxFile) => gpxFile.giornoId === giornoId);
}

export async function deleteGPXFile(gpxFileId: string, _opts?: CloudMirrorOptions): Promise<void> {
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

export async function deleteGiorno(giornoId: string, opts?: CloudMirrorOptions): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(STORE_GIORNI, "readwrite");
  transaction.objectStore(STORE_GIORNI).delete(giornoId);
  await transactionToPromise(transaction);
  if (opts?.skipCloud) {
    return;
  }
  runCloudMirrorTask(mirrorCloudDelete("giorni", giornoId));
  runCloudMirrorTask(mirrorCloudDelete("giorni_index", giornoId));
}

export async function savePrenotazione(
  prenotazione: Prenotazione,
  opts?: CloudMirrorOptions,
): Promise<void> {
  const normalized = normalizePrenotazione(prenotazione);
  if (!normalized) {
    throw new Error("Prenotazione non valida");
  }
  await putRecord(STORE_PRENOTAZIONI, normalized);
  if (opts?.skipCloud) {
    return;
  }
  runCloudMirrorTask(mirrorCloudUpsert("prenotazioni", normalized.id, normalized));
  runCloudMirrorTask(
    mirrorCloudUpsert("prenotazioni_index", normalized.id, buildPrenotazioneIndexRecord(normalized)),
  );
}

export async function getPrenotazioniByViaggio(viaggioId: string): Promise<Prenotazione[]> {
  const allRecords = await getAllRecords<LegacyPrenotazioneRecord>(STORE_PRENOTAZIONI);
  return allRecords
    .map((record) => normalizePrenotazione(record))
    .filter((record): record is Prenotazione => record !== null)
    .filter((record) => record.viaggioId === viaggioId);
}

export async function getPrenotazioniByGiorno(giornoId: string): Promise<Prenotazione[]> {
  const allRecords = await getAllRecords<LegacyPrenotazioneRecord>(STORE_PRENOTAZIONI);
  return allRecords
    .map((record) => normalizePrenotazione(record))
    .filter((record): record is Prenotazione => record !== null)
    .filter((record) => record.giornoId === giornoId);
}

export async function getPrenotazione(id: string): Promise<Prenotazione | undefined> {
  const db = await initDB();
  const transaction = db.transaction(STORE_PRENOTAZIONI, "readonly");
  const request = transaction.objectStore(STORE_PRENOTAZIONI).get(id);
  const rawRecord = await requestToPromise(request);
  await transactionToPromise(transaction);

  if (!rawRecord) {
    return undefined;
  }

  return normalizePrenotazione(rawRecord as LegacyPrenotazioneRecord) ?? undefined;
}

export async function deletePrenotazione(id: string, opts?: CloudMirrorOptions): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(STORE_PRENOTAZIONI, "readwrite");
  transaction.objectStore(STORE_PRENOTAZIONI).delete(id);
  await transactionToPromise(transaction);
  if (opts?.skipCloud) {
    return;
  }
  runCloudMirrorTask(mirrorCloudDelete("prenotazioni", id));
  runCloudMirrorTask(mirrorCloudDelete("prenotazioni_index", id));
}

export async function saveCosto(costo: Costo, opts?: CloudMirrorOptions): Promise<void> {
  const normalized = normalizeCosto(costo);
  if (!normalized) {
    throw new Error("Costo non valido");
  }
  await putRecord(STORE_COSTI, normalized);
  if (opts?.skipCloud) {
    return;
  }
  runCloudMirrorTask(mirrorCloudUpsert("costi", normalized.id, normalized));
  runCloudMirrorTask(mirrorCloudUpsert("costi_index", normalized.id, buildCostoIndexRecord(normalized)));
}

export async function getCostiByViaggio(viaggioId: string): Promise<Costo[]> {
  const allRecords = await getAllRecords<LegacyCostoRecord>(STORE_COSTI);
  return allRecords
    .map((record) => normalizeCosto(record))
    .filter((record): record is Costo => record !== null)
    .filter((record) => record.viaggioId === viaggioId);
}

export async function getCostiByGiorno(giornoId: string): Promise<Costo[]> {
  const allRecords = await getAllRecords<LegacyCostoRecord>(STORE_COSTI);
  return allRecords
    .map((record) => normalizeCosto(record))
    .filter((record): record is Costo => record !== null)
    .filter((record) => record.giornoId === giornoId);
}

export async function getCosto(id: string): Promise<Costo | undefined> {
  const db = await initDB();
  const transaction = db.transaction(STORE_COSTI, "readonly");
  const request = transaction.objectStore(STORE_COSTI).get(id);
  const rawRecord = await requestToPromise(request);
  await transactionToPromise(transaction);

  if (!rawRecord) {
    return undefined;
  }

  return normalizeCosto(rawRecord as LegacyCostoRecord) ?? undefined;
}

export async function deleteCosto(id: string, opts?: CloudMirrorOptions): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(STORE_COSTI, "readwrite");
  transaction.objectStore(STORE_COSTI).delete(id);
  await transactionToPromise(transaction);
  if (opts?.skipCloud) {
    return;
  }
  runCloudMirrorTask(mirrorCloudDelete("costi", id));
  runCloudMirrorTask(mirrorCloudDelete("costi_index", id));
}

export async function getImpostazioniApp(): Promise<ImpostazioniApp | undefined> {
  const db = await initDB();
  const transaction = db.transaction(STORE_IMPOSTAZIONI, "readonly");
  const request = transaction.objectStore(STORE_IMPOSTAZIONI).get("app");
  const rawRecord = await requestToPromise(request);
  await transactionToPromise(transaction);

  if (!rawRecord) {
    return undefined;
  }

  return normalizeImpostazioniApp(rawRecord as LegacyImpostazioniAppRecord) ?? undefined;
}

export async function saveImpostazioniApp(data: ImpostazioniApp): Promise<void> {
  const normalized = normalizeImpostazioniApp(data);
  if (!normalized) {
    throw new Error("Impostazioni non valide");
  }
  await putRecord(STORE_IMPOSTAZIONI, normalized);
}

export async function exportBackupJSON(): Promise<BackupPayload> {
  const db = await initDB();
  const transaction = db.transaction(BACKUP_STORES, "readonly");

  const [
    viaggi,
    giorni,
    gpxFiles,
    trackPoints,
    prenotazioni,
    costi,
    impostazioni,
  ] = await Promise.all([
    requestToPromise(transaction.objectStore(STORE_VIAGGI).getAll()),
    requestToPromise(transaction.objectStore(STORE_GIORNI).getAll()),
    requestToPromise(transaction.objectStore(STORE_GPX_FILES).getAll()),
    requestToPromise(transaction.objectStore(STORE_TRACK_POINTS).getAll()),
    requestToPromise(transaction.objectStore(STORE_PRENOTAZIONI).getAll()),
    requestToPromise(transaction.objectStore(STORE_COSTI).getAll()),
    requestToPromise(transaction.objectStore(STORE_IMPOSTAZIONI).getAll()),
  ]);

  await transactionToPromise(transaction);

  return {
    meta: {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
    },
    data: {
      viaggi: viaggi as unknown[],
      giorni: giorni as unknown[],
      gpxFiles: gpxFiles as unknown[],
      trackPoints: trackPoints as unknown[],
      prenotazioni: prenotazioni as unknown[],
      costi: costi as unknown[],
      impostazioni: impostazioni as unknown[],
    },
  };
}

function validateBackupPayload(payload: unknown): BackupPayload {
  if (!isRecord(payload)) {
    throw new Error("Backup non valido: payload non oggetto");
  }

  if (!isRecord(payload.meta)) {
    throw new Error("Backup non valido: metadata mancanti");
  }

  if (!isRecord(payload.data)) {
    throw new Error("Backup non valido: data mancante");
  }

  const meta = payload.meta;
  const data = payload.data;

  if (typeof meta.schemaVersion !== "number" || !Number.isFinite(meta.schemaVersion)) {
    throw new Error("Backup non valido: schemaVersion non valido");
  }
  if (typeof meta.createdAt !== "string" || !meta.createdAt.trim()) {
    throw new Error("Backup non valido: createdAt non valido");
  }
  if (typeof meta.dbName !== "string" || !meta.dbName.trim()) {
    throw new Error("Backup non valido: dbName non valido");
  }
  if (typeof meta.dbVersion !== "number" || !Number.isFinite(meta.dbVersion)) {
    throw new Error("Backup non valido: dbVersion non valido");
  }

  const requiredStores: Array<keyof BackupPayload["data"]> = [
    "viaggi",
    "giorni",
    "gpxFiles",
    "trackPoints",
    "prenotazioni",
    "costi",
    "impostazioni",
  ];

  for (const storeKey of requiredStores) {
    if (!isUnknownArray(data[storeKey])) {
      throw new Error(`Backup non valido: store ${storeKey} mancante o non array`);
    }
  }

  return payload as unknown as BackupPayload;
}

export async function restoreFromBackupJSON(payload: BackupPayload): Promise<void> {
  const validated = validateBackupPayload(payload);
  const db = await initDB();
  const transaction = db.transaction(BACKUP_STORES, "readwrite");

  for (const storeName of BACKUP_STORES) {
    transaction.objectStore(storeName).clear();
  }

  for (const record of validated.data.viaggi) {
    transaction.objectStore(STORE_VIAGGI).put(record);
  }
  for (const record of validated.data.giorni) {
    transaction.objectStore(STORE_GIORNI).put(record);
  }
  for (const record of validated.data.gpxFiles) {
    transaction.objectStore(STORE_GPX_FILES).put(record);
  }
  for (const record of validated.data.trackPoints) {
    transaction.objectStore(STORE_TRACK_POINTS).put(record);
  }
  for (const record of validated.data.prenotazioni) {
    transaction.objectStore(STORE_PRENOTAZIONI).put(record);
  }
  for (const record of validated.data.costi) {
    transaction.objectStore(STORE_COSTI).put(record);
  }
  for (const record of validated.data.impostazioni) {
    transaction.objectStore(STORE_IMPOSTAZIONI).put(record);
  }

  await transactionToPromise(transaction);
}

export async function deleteViaggioCascade(
  viaggioId: string,
  opts?: CloudMirrorOptions,
): Promise<void> {
  const giorni = await getGiorniByViaggio(viaggioId);

  for (const giorno of giorni) {
    await deleteTrackPointsByGiornoId(giorno.id);
    await deleteGpxFilesByGiornoId(giorno.id);
    await deleteGiorno(giorno.id, opts);
  }

  const prenotazioni = await getPrenotazioniByViaggio(viaggioId);
  for (const prenotazione of prenotazioni) {
    await deletePrenotazione(prenotazione.id, opts);
  }

  const costi = await getCostiByViaggio(viaggioId);
  for (const costo of costi) {
    await deleteCosto(costo.id, opts);
  }

  const db = await initDB();
  const transaction = db.transaction(STORE_VIAGGI, "readwrite");
  transaction.objectStore(STORE_VIAGGI).delete(viaggioId);
  await transactionToPromise(transaction);
  if (opts?.skipCloud) {
    return;
  }
  runCloudMirrorTask(mirrorCloudDelete("viaggi", viaggioId));
  runCloudMirrorTask(mirrorCloudDelete("viaggi_index", viaggioId));
}
