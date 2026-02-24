import { setUserDoc } from "../firebase/firestoreHelpers";
import { exportBackupJSON, getViaggi } from "./storage";

function sanitizeForFirestore(input: unknown): unknown {
  if (input === undefined) return undefined;
  if (input === null) return null;
  if (input instanceof Date) return input;

  if (Array.isArray(input)) {
    return input
      .map(sanitizeForFirestore)
      .filter((value) => value !== undefined);
  }

  if (typeof input === "object") {
    const out: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
      const sanitizedValue = sanitizeForFirestore(value);
      if (sanitizedValue !== undefined) {
        out[key] = sanitizedValue;
      }
    }

    return out;
  }

  return input;
}

function getRecordId(record: unknown, collectionName: string): string {
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw new Error(`Record non valido per ${collectionName}`);
  }

  const id = (record as { id?: unknown }).id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error(`Record senza id per ${collectionName}`);
  }

  return id;
}

async function pushGenericCollection(
  collectionName: "giorni" | "costi" | "prenotazioni",
  records: unknown[],
): Promise<number> {
  for (const record of records) {
    const id = getRecordId(record, collectionName);
    await setUserDoc(collectionName, id, sanitizeForFirestore(record));
  }

  return records.length;
}

export async function cloudBackupViaggi(): Promise<number> {
  const viaggi = await getViaggi();

  for (const viaggio of viaggi) {
    const rawViaggio = viaggio as Record<string, unknown>;
    const displayName =
      viaggio.nome ??
      (typeof rawViaggio.displayName === "string" ? rawViaggio.displayName : undefined) ??
      "Viaggio";

    const clean = sanitizeForFirestore({
      ...viaggio,
      displayName,
      updatedAt: new Date().toISOString(),
    });

    await setUserDoc("viaggi", viaggio.id, clean);
    await setUserDoc(
      "viaggi_index",
      viaggio.id,
      sanitizeForFirestore({
        id: viaggio.id,
        nome: viaggio.nome ?? "",
        dataInizio: viaggio.dataInizio ?? "",
        dataFine: viaggio.dataFine ?? "",
        stato: viaggio.stato ?? "",
        valuta: viaggio.valuta ?? "",
      }),
    );
  }

  return viaggi.length;
}

export async function cloudBackupGiorni(): Promise<number> {
  const payload = await exportBackupJSON();
  return pushGenericCollection("giorni", payload.data.giorni);
}

function getStableCostoId(record: unknown): string | undefined {
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    return undefined;
  }

  const candidate = record as {
    id?: unknown;
    costoId?: unknown;
    uuid?: unknown;
    key?: unknown;
  };

  if (typeof candidate.id === "string" && candidate.id.trim()) {
    return candidate.id;
  }
  if (typeof candidate.costoId === "string" && candidate.costoId.trim()) {
    return candidate.costoId;
  }
  if (typeof candidate.uuid === "string" && candidate.uuid.trim()) {
    return candidate.uuid;
  }
  if (typeof candidate.key === "string" && candidate.key.trim()) {
    return candidate.key;
  }

  return undefined;
}

async function pushCostiRecords(records: unknown[]): Promise<{ pushed: number; skipped: number }> {
  let pushed = 0;
  let skipped = 0;

  for (const costo of records) {
    const costoId = getStableCostoId(costo);
    if (!costoId) {
      skipped += 1;
      continue;
    }

    await setUserDoc("costi", costoId, sanitizeForFirestore(costo));
    pushed += 1;
  }

  return { pushed, skipped };
}

export async function cloudBackupCosti(): Promise<{ pushed: number; skipped: number }> {
  const payload = await exportBackupJSON();
  return pushCostiRecords(payload.data.costi);
}

export async function cloudBackupPrenotazioni(): Promise<number> {
  const payload = await exportBackupJSON();
  return pushGenericCollection("prenotazioni", payload.data.prenotazioni);
}

export async function cloudBackupAll(): Promise<
  | {
      ok: true;
      viaggi: number;
      giorni: number;
      costi: number;
      costiSkipped: number;
      prenotazioni: number;
    }
  | { ok: false; error: string }
> {
  try {
    const viaggi = await cloudBackupViaggi();
    const payload = await exportBackupJSON();
    const giorni = await pushGenericCollection("giorni", payload.data.giorni);
    const costiResult = await pushCostiRecords(payload.data.costi);
    const prenotazioni = await pushGenericCollection("prenotazioni", payload.data.prenotazioni);

    return {
      ok: true,
      viaggi,
      giorni,
      costi: costiResult.pushed,
      costiSkipped: costiResult.skipped,
      prenotazioni,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Cloud backup failed",
    };
  }
}
