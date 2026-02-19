const memoryStore = new Map<string, unknown>();

export async function saveItem<T>(key: string, value: T): Promise<void> {
  memoryStore.set(key, value);
}

export async function getItem<T>(key: string): Promise<T | null> {
  const value = memoryStore.get(key);
  return (value as T) ?? null;
}

export async function removeItem(key: string): Promise<void> {
  memoryStore.delete(key);
}
