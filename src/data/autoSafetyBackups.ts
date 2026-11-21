export const AUTO_SAFETY_BACKUPS_UPDATED_EVENT = 'eternalblue:auto-safety-backups-updated';

export interface AutoSafetyBackupSummary {
  id: string;
  kind: 'latest' | 'daily';
  dayKey: string;
  createdAt: string;
  productCount: number;
  saleCount: number;
}

interface StoredAutoSafetyBackup extends AutoSafetyBackupSummary {
  payloadJson: string;
}

const DATABASE_NAME = 'eternalblue-pos-safety-backups';
const DATABASE_VERSION = 1;
const STORE_NAME = 'snapshots';
const DAILY_BACKUP_LIMIT = 3;

function localDayKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function announceUpdate(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTO_SAFETY_BACKUPS_UPDATED_EVENT));
  }
}

export function createAutoSafetyBackupRepository(databaseName = DATABASE_NAME) {
  let databasePromise: Promise<IDBDatabase> | null = null;

  const openDatabase = (): Promise<IDBDatabase> => {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
    }
    if (databasePromise) return databasePromise;

    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          databasePromise = null;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error('Could not open safety backup storage.'));
      request.onblocked = () => reject(new Error('Safety backup storage upgrade is blocked by another tab.'));
    }).catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });

    return databasePromise;
  };

  return {
    async saveLatestAndDaily(
      payloadJson: string,
      productCount: number,
      saleCount: number,
      now = new Date()
    ): Promise<void> {
      if (!payloadJson.trim()) throw new Error('Cannot save an empty safety backup.');
      const database = await openDatabase();
      const createdAt = now.toISOString();
      const dayKey = localDayKey(now);

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const record: StoredAutoSafetyBackup = {
          id: 'latest',
          kind: 'latest',
          dayKey,
          createdAt,
          productCount,
          saleCount,
          payloadJson,
        };
        store.put(record);

        const dailyId = `daily:${dayKey}`;
        const dailyRequest = store.get(dailyId);
        dailyRequest.onsuccess = () => {
          if (!dailyRequest.result) {
            store.put({ ...record, id: dailyId, kind: 'daily' });
          }
          const allRequest = store.getAll() as IDBRequest<StoredAutoSafetyBackup[]>;
          allRequest.onsuccess = () => {
            const dailyRecords = allRequest.result
              .filter((item) => item.kind === 'daily')
              .sort((a, b) => b.dayKey.localeCompare(a.dayKey));
            dailyRecords.slice(DAILY_BACKUP_LIMIT).forEach((item) => store.delete(item.id));
          };
        };

        transaction.oncomplete = () => {
          announceUpdate();
          resolve();
        };
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Could not save an automatic safety backup.'));
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Automatic safety backup was canceled.'));
      });
    },

    async list(): Promise<AutoSafetyBackupSummary[]> {
      const database = await openDatabase();
      return new Promise<AutoSafetyBackupSummary[]>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).getAll() as IDBRequest<StoredAutoSafetyBackup[]>;
        request.onsuccess = () => {
          const records = request.result
            .filter((item) => item.kind === 'daily')
            .sort((a, b) => b.dayKey.localeCompare(a.dayKey));
          const latest = request.result.find((item) => item.id === 'latest');
          resolve(
            [
              ...(latest ? [latest] : []),
              ...records.slice(0, DAILY_BACKUP_LIMIT),
            ].map(({ id, kind, dayKey, createdAt, productCount, saleCount }) => ({
              id,
              kind,
              dayKey,
              createdAt,
              productCount,
              saleCount,
            }))
          );
        };
        request.onerror = () =>
          reject(request.error ?? new Error('Could not list automatic safety backups.'));
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Could not read automatic safety backups.'));
      });
    },

    async load(id: string): Promise<string | null> {
      const database = await openDatabase();
      return new Promise<string | null>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(id) as IDBRequest<StoredAutoSafetyBackup | undefined>;
        request.onsuccess = () => resolve(request.result?.payloadJson ?? null);
        request.onerror = () => reject(request.error ?? new Error('Could not read the selected safety backup.'));
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Could not read the selected safety backup.'));
      });
    },

    async clear(): Promise<void> {
      if (typeof indexedDB === 'undefined') return;
      const database = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).clear();
        transaction.oncomplete = () => {
          announceUpdate();
          resolve();
        };
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Could not clear automatic safety backups.'));
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Could not clear automatic safety backups.'));
      });
    },
  };
}

export const AutoSafetyBackupRepository = createAutoSafetyBackupRepository();
