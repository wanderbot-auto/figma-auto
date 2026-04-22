export interface CacheEntry<T> {
  documentKey: string;
  generation: number;
  expiresAt: number;
  value: T;
}

const QUERY_CACHE_TTL_MS = 2000;

let cacheGeneration = 0;

function getDocumentKey(): string {
  return `${figma.fileKey ?? "__local__"}:${figma.root.name}`;
}

export function invalidateQueryCaches(): void {
  cacheGeneration += 1;
}

export function readCachedValue<T>(entry: CacheEntry<T> | null | undefined): T | null {
  if (!entry) {
    return null;
  }

  if (entry.documentKey !== getDocumentKey()) {
    return null;
  }

  if (entry.generation !== cacheGeneration) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    return null;
  }

  return entry.value;
}

export function writeCachedValue<T>(value: T): CacheEntry<T> {
  return {
    documentKey: getDocumentKey(),
    generation: cacheGeneration,
    expiresAt: Date.now() + QUERY_CACHE_TTL_MS,
    value
  };
}

export function makePayloadCacheKey(payload: unknown): string {
  return JSON.stringify(payload);
}
