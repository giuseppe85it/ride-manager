import { deleteUserDoc, getUserDoc, setUserDoc, setUserDocMerge } from "../firebase/firestoreHelpers";
import { firebaseAuth } from "../firebase/firebaseAuth";
import { getClientId } from "./clientIdentity";
import { enqueueOutbox, listOutbox, removeOutbox } from "./storage";
import type { CloudSyncCollectionName, OutboxRecord } from "./storage";

export const RM_LAST_SYNC_AT_KEY = "rm_last_sync_at";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function withSyncMetadata(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  const nowIso = new Date().toISOString();
  const updatedAt =
    typeof input.updatedAt === "string" && input.updatedAt.trim() ? input.updatedAt : nowIso;

  return {
    ...input,
    _clientId: getClientId(),
    updatedAt,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Cloud sync failed";
}

export async function cloudUpsert(
  collection: CloudSyncCollectionName,
  docId: string,
  data: unknown,
): Promise<{ ok: true } | { skipped: true } | { queued: true; error: string }> {
  if (!firebaseAuth.currentUser) {
    return { skipped: true };
  }

  const payload = sanitizeForFirestore(withSyncMetadata(data));

  try {
    await setUserDoc(collection, docId, payload);
    return { ok: true };
  } catch (error) {
    const message = errorMessage(error);
    try {
      await enqueueOutbox("set", collection, docId, payload);
    } catch (queueError) {
      console.warn("Unable to enqueue outbox set", queueError);
    }
    return { queued: true, error: message };
  }
}

export async function cloudDelete(
  collection: CloudSyncCollectionName,
  docId: string,
): Promise<{ ok: true } | { skipped: true } | { queued: true; error: string }> {
  if (!firebaseAuth.currentUser) {
    return { skipped: true };
  }

  try {
    try {
      const current = await getUserDoc(collection, docId);
      if (current.exists()) {
        await setUserDocMerge(collection, docId, {
          _clientId: getClientId(),
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (stampError) {
      console.warn("Unable to stamp delete metadata before delete", stampError);
    }

    await deleteUserDoc(collection, docId);
    return { ok: true };
  } catch (error) {
    const message = errorMessage(error);
    try {
      await enqueueOutbox("del", collection, docId);
    } catch (queueError) {
      console.warn("Unable to enqueue outbox delete", queueError);
    }
    return { queued: true, error: message };
  }
}

async function applyOutboxEntry(entry: OutboxRecord): Promise<void> {
  if (entry.op === "set") {
    await setUserDoc(entry.collection, entry.docId, entry.payload);
    return;
  }

  await deleteUserDoc(entry.collection, entry.docId);
}

export async function flushOutbox(): Promise<
  | { skipped: true }
  | { ok: true; processed: number; remaining: number }
  | { ok: false; processed: number; remaining: number; error: string }
> {
  if (!firebaseAuth.currentUser) {
    return { skipped: true };
  }

  const entries = await listOutbox();
  let processed = 0;

  for (const entry of entries) {
    try {
      await applyOutboxEntry(entry);
      await removeOutbox(entry.id);
      processed += 1;
    } catch (error) {
      return {
        ok: false,
        processed,
        remaining: entries.length - processed,
        error: errorMessage(error),
      };
    }
  }

  if (processed > 0) {
    localStorage.setItem(RM_LAST_SYNC_AT_KEY, new Date().toISOString());
  }

  return { ok: true, processed, remaining: 0 };
}
