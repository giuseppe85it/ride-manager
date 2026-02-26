import { onSnapshot, type DocumentData, type QuerySnapshot } from "firebase/firestore";
import { userCollection } from "../firebase/firestoreHelpers";
import { firebaseAuth } from "../firebase/firebaseAuth";
import type { Costo } from "../models/Costo";
import type { GPXFile } from "../models/GPXFile";
import type { Giorno } from "../models/Giorno";
import type { Prenotazione } from "../models/Prenotazione";
import type { Viaggio } from "../models/Viaggio";
import { getClientId } from "./clientIdentity";
import {
  deleteCosto,
  deleteGPXFile,
  deleteGiorno,
  deletePrenotazione,
  deleteTrackPointsByGpxFileId,
  deleteViaggioCascade,
  getCloudSyncRecordRaw,
  hasPendingOutboxEntry,
  saveGPXFile,
  saveCosto,
  saveGiorno,
  savePrenotazione,
  saveViaggio,
  type RealtimeDataCollectionName,
} from "./storage";

const REALTIME_COLLECTIONS: RealtimeDataCollectionName[] = [
  "viaggi",
  "giorni",
  "gpxFiles",
  "prenotazioni",
  "costi",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIsoMillis(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getRecordTimestampMillis(record: Record<string, unknown> | undefined): number | null {
  if (!record) {
    return null;
  }

  const topLevelUpdatedAt = parseIsoMillis(record.updatedAt);
  if (topLevelUpdatedAt !== null) {
    return topLevelUpdatedAt;
  }

  const createdAt = parseIsoMillis(record.createdAt);
  if (createdAt !== null) {
    return createdAt;
  }

  const dayPlan = isRecord(record.dayPlan) ? record.dayPlan : undefined;
  const dayPlanUpdatedAt = parseIsoMillis(dayPlan?.updatedAt);
  if (dayPlanUpdatedAt !== null) {
    return dayPlanUpdatedAt;
  }

  return null;
}

function shouldApplyRemoteUpsert(
  remoteRecord: Record<string, unknown>,
  localRecord: Record<string, unknown> | undefined,
): boolean {
  if (!localRecord) {
    return true;
  }

  const remoteTs = getRecordTimestampMillis(remoteRecord);
  const localTs = getRecordTimestampMillis(localRecord);

  if (remoteTs === null) {
    return false;
  }
  if (localTs === null) {
    return true;
  }

  return remoteTs > localTs;
}

function shouldApplyRemoteDelete(
  remoteRecord: Record<string, unknown> | undefined,
  localRecord: Record<string, unknown> | undefined,
): boolean {
  if (!localRecord) {
    return false;
  }

  const remoteTs = getRecordTimestampMillis(remoteRecord);
  const localTs = getRecordTimestampMillis(localRecord);

  if (remoteTs === null) {
    return true;
  }
  if (localTs === null) {
    return true;
  }

  return remoteTs >= localTs;
}

async function applyRemoteUpsert(
  collection: RealtimeDataCollectionName,
  docId: string,
  remoteData: Record<string, unknown>,
): Promise<void> {
  const payload = { ...remoteData, id: docId };

  if (collection === "viaggi") {
    await saveViaggio(payload as unknown as Viaggio, { skipCloud: true });
    return;
  }

  if (collection === "giorni") {
    await saveGiorno(payload as unknown as Giorno, { skipCloud: true });
    return;
  }

  if (collection === "gpxFiles") {
    await saveGPXFile(payload as unknown as GPXFile, { skipCloud: true });
    return;
  }

  if (collection === "prenotazioni") {
    await savePrenotazione(payload as unknown as Prenotazione, { skipCloud: true });
    return;
  }

  await saveCosto(payload as unknown as Costo, { skipCloud: true });
}

async function applyRemoteDelete(
  collection: RealtimeDataCollectionName,
  docId: string,
): Promise<void> {
  if (collection === "viaggi") {
    await deleteViaggioCascade(docId, { skipCloud: true });
    return;
  }

  if (collection === "giorni") {
    await deleteGiorno(docId, { skipCloud: true });
    return;
  }

  if (collection === "gpxFiles") {
    await deleteTrackPointsByGpxFileId(docId);
    await deleteGPXFile(docId, { skipCloud: true });
    return;
  }

  if (collection === "prenotazioni") {
    await deletePrenotazione(docId, { skipCloud: true });
    return;
  }

  await deleteCosto(docId, { skipCloud: true });
}

async function processCollectionSnapshot(
  collection: RealtimeDataCollectionName,
  clientId: string,
  snapshot: QuerySnapshot<DocumentData>,
): Promise<void> {
  for (const change of snapshot.docChanges()) {
    const docId = change.doc.id;
    const remoteDataUnknown = change.doc.data();
    const remoteRecord = isRecord(remoteDataUnknown) ? remoteDataUnknown : undefined;

    if (remoteRecord?._clientId === clientId) {
      continue;
    }

    if (await hasPendingOutboxEntry(collection, docId)) {
      continue;
    }

    const localRecord = await getCloudSyncRecordRaw(collection, docId);

    if (change.type === "removed") {
      if (!shouldApplyRemoteDelete(remoteRecord, localRecord)) {
        continue;
      }

      try {
        await applyRemoteDelete(collection, docId);
      } catch (error) {
        console.warn(`Realtime delete apply failed for ${collection}/${docId}`, error);
      }
      continue;
    }

    if (!remoteRecord) {
      continue;
    }

    if (!shouldApplyRemoteUpsert(remoteRecord, localRecord)) {
      continue;
    }

    try {
      await applyRemoteUpsert(collection, docId, remoteRecord);
    } catch (error) {
      console.warn(`Realtime upsert apply failed for ${collection}/${docId}`, error);
    }
  }
}

export function startRealtimeSync(): () => void {
  if (!firebaseAuth.currentUser) {
    return () => {};
  }

  const clientId = getClientId();
  const unsubscribes: Array<() => void> = [];

  for (const collection of REALTIME_COLLECTIONS) {
    let queue = Promise.resolve();

    const unsubscribe = onSnapshot(
      userCollection(collection),
      (snapshot) => {
        queue = queue
          .then(() => processCollectionSnapshot(collection, clientId, snapshot))
          .catch((error) => {
            console.warn(`Realtime sync queue failed for ${collection}`, error);
          });
      },
      (error) => {
        console.warn(`Realtime listener failed for ${collection}`, error);
      },
    );

    unsubscribes.push(unsubscribe);
  }

  return () => {
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  };
}
