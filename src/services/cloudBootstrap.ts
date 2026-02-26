import { firebaseAuth } from "../firebase/firebaseAuth";
import { getUserCollection } from "../firebase/firestoreHelpers";
import {
  exportBackupJSON,
  getViaggiRecordCount,
  restoreFromBackupJSON,
  type BackupPayload,
} from "./storage";

type BootstrapCollectionName = "viaggi" | "giorni" | "gpxFiles" | "prenotazioni" | "costi";

export type CloudBootstrapResult =
  | { skipped: true; reason: "not-authenticated" }
  | { skipped: true; reason: "local-not-empty"; localViaggiCount: number }
  | {
      skipped: true;
      reason: "cloud-empty";
      counts: { viaggi: number; giorni: number; gpxFiles: number; prenotazioni: number; costi: number };
    }
  | {
      ok: true;
      counts: {
        viaggi: number;
        giorni: number;
        gpxFiles: number;
        prenotazioni: number;
        costi: number;
      };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRestorableRecords(
  collectionName: BootstrapCollectionName,
  snapshot: Awaited<ReturnType<typeof getUserCollection>>,
): unknown[] {
  const records: unknown[] = [];

  for (const docSnapshot of snapshot.docs) {
    const data = docSnapshot.data();
    if (!isRecord(data)) {
      console.warn(
        `Cloud bootstrap: record non oggetto saltato in ${collectionName}/${docSnapshot.id}`,
      );
      continue;
    }

    const recordId = typeof data.id === "string" && data.id.trim() ? data.id : docSnapshot.id;
    records.push({ ...data, id: recordId });
  }

  return records;
}

export async function bootstrapFromCloudIfEmpty(): Promise<CloudBootstrapResult> {
  if (!firebaseAuth.currentUser) {
    return { skipped: true, reason: "not-authenticated" };
  }

  const localViaggiCount = await getViaggiRecordCount();
  if (localViaggiCount > 0) {
    return { skipped: true, reason: "local-not-empty", localViaggiCount };
  }

  const [viaggiSnapshot, giorniSnapshot, gpxFilesSnapshot, prenotazioniSnapshot, costiSnapshot] = await Promise.all([
    getUserCollection("viaggi"),
    getUserCollection("giorni"),
    getUserCollection("gpxFiles"),
    getUserCollection("prenotazioni"),
    getUserCollection("costi"),
  ]);

  const viaggi = toRestorableRecords("viaggi", viaggiSnapshot);
  const giorni = toRestorableRecords("giorni", giorniSnapshot);
  const gpxFiles = toRestorableRecords("gpxFiles", gpxFilesSnapshot);
  const prenotazioni = toRestorableRecords("prenotazioni", prenotazioniSnapshot);
  const costi = toRestorableRecords("costi", costiSnapshot);

  const counts = {
    viaggi: viaggi.length,
    giorni: giorni.length,
    gpxFiles: gpxFiles.length,
    prenotazioni: prenotazioni.length,
    costi: costi.length,
  };

  if (counts.viaggi + counts.giorni + counts.gpxFiles + counts.prenotazioni + counts.costi === 0) {
    return { skipped: true, reason: "cloud-empty", counts };
  }

  const basePayload = await exportBackupJSON();
  const payload: BackupPayload = {
    meta: {
      ...basePayload.meta,
      createdAt: new Date().toISOString(),
    },
    data: {
      ...basePayload.data,
      viaggi,
      giorni,
      gpxFiles,
      prenotazioni,
      costi,
    },
  };

  await restoreFromBackupJSON(payload);

  return { ok: true, counts };
}
