import type { Costo, CostoCategoria, CostoPagatoDa } from "../models/Costo";
import type { Giorno } from "../models/Giorno";
import type { GPXFile } from "../models/GPXFile";
import type { ImpostazioniApp, Partecipante } from "../models/ImpostazioniApp";
import type { Prenotazione, PrenotazioneStato, PrenotazioneTipo } from "../models/Prenotazione";
import type { TrackPoint } from "../models/TrackPoint";
import type { Viaggio } from "../models/Viaggio";

const DB_NAME = "RideManagerDB";
const DB_VERSION = 7;

const STORE_VIAGGI = "viaggi";
const STORE_GIORNI = "giorni";
const STORE_GPX_FILES = "gpxFiles";
const STORE_TRACK_POINTS = "trackPoints";
const STORE_PRENOTAZIONI = "prenotazioni";
const STORE_COSTI = "costi";
const STORE_IMPOSTAZIONI = "impostazioni";
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
  | typeof STORE_IMPOSTAZIONI;

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

function isPrenotazioneTipo(value: unknown): value is PrenotazioneTipo {
  return value === "HOTEL" || value === "TRAGHETTO";
}

function isPrenotazioneStato(value: unknown): value is PrenotazioneStato {
  return value === "OPZIONE" || value === "CONFERMATA" || value === "CANCELLATA";
}

function isCostoCategoria(value: unknown): value is CostoCategoria {
  return value === "BENZINA" || value === "HOTEL" || value === "TRAGHETTI" || value === "EXTRA";
}

function isCostoPagatoDa(value: unknown): value is CostoPagatoDa {
  return value === "IO" || value === "LEI" || value === "DIVISO";
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

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
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
    dataFine: toValidIso(record.dataFine),
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
    pagatoDa: isCostoPagatoDa(record.pagatoDa) ? record.pagatoDa : undefined,
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
    pagatoDa: isCostoPagatoDa(record.pagatoDa) ? record.pagatoDa : "IO",
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

export async function savePrenotazione(prenotazione: Prenotazione): Promise<void> {
  const normalized = normalizePrenotazione(prenotazione);
  if (!normalized) {
    throw new Error("Prenotazione non valida");
  }
  await putRecord(STORE_PRENOTAZIONI, normalized);
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

export async function deletePrenotazione(id: string): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(STORE_PRENOTAZIONI, "readwrite");
  transaction.objectStore(STORE_PRENOTAZIONI).delete(id);
  await transactionToPromise(transaction);
}

export async function saveCosto(costo: Costo): Promise<void> {
  const normalized = normalizeCosto(costo);
  if (!normalized) {
    throw new Error("Costo non valido");
  }
  await putRecord(STORE_COSTI, normalized);
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

export async function deleteCosto(id: string): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(STORE_COSTI, "readwrite");
  transaction.objectStore(STORE_COSTI).delete(id);
  await transactionToPromise(transaction);
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

export async function deleteViaggioCascade(viaggioId: string): Promise<void> {
  const giorni = await getGiorniByViaggio(viaggioId);

  for (const giorno of giorni) {
    await deleteTrackPointsByGiornoId(giorno.id);
    await deleteGpxFilesByGiornoId(giorno.id);
    await deleteGiorno(giorno.id);
  }

  const prenotazioni = await getPrenotazioniByViaggio(viaggioId);
  for (const prenotazione of prenotazioni) {
    await deletePrenotazione(prenotazione.id);
  }

  const costi = await getCostiByViaggio(viaggioId);
  for (const costo of costi) {
    await deleteCosto(costo.id);
  }

  const db = await initDB();
  const transaction = db.transaction(STORE_VIAGGI, "readwrite");
  transaction.objectStore(STORE_VIAGGI).delete(viaggioId);
  await transactionToPromise(transaction);
}
