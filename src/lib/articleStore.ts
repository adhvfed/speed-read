import type { ArticleContent, StoredArticle, StoredArticleSource } from '../types';

const DB_NAME = 'speed-read-library';
const DB_VERSION = 1;
const STORE_NAME = 'articles';
const HARD_LIMIT_BYTES = 50 * 1024 * 1024;
const MAX_ARTICLES = 100;
const RECORD_OVERHEAD_BYTES = 512;

export interface StoreResult {
  id: string;
  saved: boolean;
  pruned: number;
  reason?: 'unavailable' | 'quota' | 'too-large';
}

export interface PrunePlan {
  accepted: boolean;
  deleteIds: string[];
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
  });
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      if (!store.indexNames.contains('lastAccessedAt')) store.createIndex('lastAccessedAt', 'lastAccessedAt');
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade was blocked.'));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise!;
}

function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength + RECORD_OVERHEAD_BYTES;
}

function fallbackHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function isStoredArticle(value: unknown): value is StoredArticle {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<StoredArticle>;
  const article = record.article;
  return typeof record.id === 'string' &&
    Boolean(article && typeof article.title === 'string' && Array.isArray(article.paragraphs) && article.paragraphs.every((item) => typeof item === 'string')) &&
    ['url', 'text', 'sample'].includes(String(record.sourceType)) &&
    [record.createdAt, record.updatedAt, record.lastAccessedAt, record.estimatedBytes]
      .every((item) => typeof item === 'number' && Number.isFinite(item) && item >= 0);
}

export async function articleIdFor(article: ArticleContent, sourceType: StoredArticleSource): Promise<string> {
  const basis = article.sourceUrl
    ? `url:${new URL(article.sourceUrl).toString()}`
    : `${sourceType}:${article.title}\n${article.paragraphs.join('\n')}`;
  try {
    if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable.');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(basis));
    return Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return fallbackHash(basis);
  }
}

export function planArticlePruning(
  records: StoredArticle[],
  incoming: Pick<StoredArticle, 'id' | 'estimatedBytes'>,
  budgetBytes: number,
  maxArticles = MAX_ARTICLES,
): PrunePlan {
  if (incoming.estimatedBytes > budgetBytes) return { accepted: false, deleteIds: [] };
  const candidates = records
    .filter((record) => record.id !== incoming.id)
    .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  let totalBytes = candidates.reduce((sum, record) => sum + record.estimatedBytes, 0) + incoming.estimatedBytes;
  let totalArticles = candidates.length + 1;
  const deleteIds: string[] = [];
  for (const record of candidates) {
    if (totalBytes <= budgetBytes && totalArticles <= maxArticles) break;
    deleteIds.push(record.id);
    totalBytes -= record.estimatedBytes;
    totalArticles -= 1;
  }
  return { accepted: totalBytes <= budgetBytes && totalArticles <= maxArticles, deleteIds };
}

async function allArticles(database: IDBDatabase): Promise<StoredArticle[]> {
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const done = transactionDone(transaction);
  const result = await requestResult(transaction.objectStore(STORE_NAME).getAll() as IDBRequest<StoredArticle[]>);
  await done;
  return result.filter(isStoredArticle);
}

async function storageBudget(records: StoredArticle[]): Promise<number> {
  let budget = HARD_LIMIT_BYTES;
  try {
    const estimate = await navigator.storage?.estimate();
    if (!estimate?.quota) return budget;
    budget = Math.min(budget, Math.max(256 * 1024, Math.floor(estimate.quota * 0.01)));
    const currentLibraryBytes = records.reduce((sum, record) => sum + record.estimatedBytes, 0);
    const usage = estimate.usage ?? 0;
    const reserve = Math.min(5 * 1024 * 1024, Math.floor(estimate.quota * 0.005));
    const availableGrowth = Math.max(0, estimate.quota - usage - reserve);
    budget = Math.min(budget, currentLibraryBytes + availableGrowth);
  } catch {
    // The fixed application cap still applies when StorageManager is unavailable.
  }
  return Math.max(0, budget);
}

async function writeArticle(database: IDBDatabase, article: StoredArticle, deleteIds: string[]): Promise<void> {
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(STORE_NAME);
  for (const id of deleteIds) store.delete(id);
  store.put(article);
  await done;
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (
    error.name === 'QuotaExceededError' ||
    (error.name === 'UnknownError' && /quota|space|disk/i.test(error.message))
  );
}

export async function storeArticle(article: ArticleContent, sourceType: StoredArticleSource): Promise<StoreResult> {
  const id = await articleIdFor(article, sourceType);
  try {
    const database = await openDatabase();
    const records = await allArticles(database);
    const existing = records.find((record) => record.id === id);
    const now = Date.now();
    const record: StoredArticle = {
      id,
      article,
      sourceType,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastAccessedAt: now,
      estimatedBytes: 0,
    };
    record.estimatedBytes = byteSize(record);
    const budget = await storageBudget(records);
    const plan = planArticlePruning(records, record, budget);
    if (!plan.accepted) return { id, saved: false, pruned: 0, reason: 'too-large' };
    try {
      await writeArticle(database, record, plan.deleteIds);
      return { id, saved: true, pruned: plan.deleteIds.length };
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      const recovery = records
        .filter((candidate) => candidate.id !== id && !plan.deleteIds.includes(candidate.id))
        .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
      const recoveryDeletes = [...plan.deleteIds];
      let freed = 0;
      for (const candidate of recovery) {
        recoveryDeletes.push(candidate.id);
        freed += candidate.estimatedBytes;
        if (freed >= record.estimatedBytes + 1024 * 1024) break;
      }
      try {
        await writeArticle(database, record, recoveryDeletes);
        return { id, saved: true, pruned: recoveryDeletes.length };
      } catch {
        return { id, saved: false, pruned: 0, reason: 'quota' };
      }
    }
  } catch {
    return { id, saved: false, pruned: 0, reason: 'unavailable' };
  }
}

export async function getStoredArticle(id: string): Promise<StoredArticle | null> {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const record = await requestResult(transaction.objectStore(STORE_NAME).get(id) as IDBRequest<StoredArticle | undefined>);
    await done;
    if (!isStoredArticle(record)) return null;
    const touched = { ...record, lastAccessedAt: Date.now() };
    try {
      await writeArticle(database, touched, []);
    } catch {
      // Reading the saved copy succeeded; an LRU touch is best effort.
    }
    return touched;
  } catch {
    return null;
  }
}
