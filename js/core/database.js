const DATABASE_NAME = "vault_reconstruction_archive";
const DATABASE_VERSION = 1;
const STATE_STORE = "state";
const SNAPSHOT_STORE = "snapshots";
const PRIMARY_KEY = "primary";
const NORMALIZED_CORE_KEY = "core_v2";
const NORMALIZED_EVENTS_KEY = "events_v2";
const NORMALIZED_HEADER_KEY = "header_v1";
const METADATA_PREFIX = "metadata:";
const ITEM_PREFIX = "item:";

let databasePromise;
let normalizedMetadataReady = false;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction was aborted."));
  });
}

function splitState(value) {
  const { items = {}, events = [], metadata = {}, ...core } = value;
  return { items, events, metadata, core };
}

const metadataRange = () => IDBKeyRange.bound(METADATA_PREFIX, `${METADATA_PREFIX}\uffff`);

export function openDatabase() {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STATE_STORE)) {
        database.createObjectStore(STATE_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        const snapshots = database.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
        snapshots.createIndex("createdAt", "createdAt");
        snapshots.createIndex("kind", "kind");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("The archive database could not be opened."));
    request.onblocked = () => reject(new Error("The archive database upgrade is blocked by another Vault tab."));
  });
  return databasePromise;
}

export async function readPrimaryState() {
  const database = await openDatabase();
  if (!database) return null;
  const transaction = database.transaction(STATE_STORE, "readonly");
  const done = transactionDone(transaction);
  const store = transaction.objectStore(STATE_STORE);
  const [core, events, header, metadataRecords, itemRecords, legacy] = await Promise.all([
    requestResult(store.get(NORMALIZED_CORE_KEY)),
    requestResult(store.get(NORMALIZED_EVENTS_KEY)),
    requestResult(store.get(NORMALIZED_HEADER_KEY)),
    requestResult(store.getAll(metadataRange())),
    requestResult(store.getAll(IDBKeyRange.bound(ITEM_PREFIX, `${ITEM_PREFIX}\uffff`))),
    requestResult(store.get(PRIMARY_KEY))
  ]);
  await done;
  if (core?.value) {
    normalizedMetadataReady = Boolean(header?.metadataNormalized);
    const normalizedMetadata = Object.fromEntries(metadataRecords.map(record => [record.name, record.value]));
    return {
      ...core.value,
      updatedAt: header?.updatedAt || core.value.updatedAt,
      metadata: normalizedMetadataReady
        ? normalizedMetadata
        : { ...(core.value.metadata || {}), ...normalizedMetadata },
      items: Object.fromEntries(itemRecords.map(record => [record.id, record.value])),
      events: events?.value || []
    };
  }
  return legacy?.value || null;
}

export async function writePrimaryState(value) {
  const database = await openDatabase();
  if (!database) return false;
  const transaction = database.transaction(STATE_STORE, "readwrite");
  const done = transactionDone(transaction);
  const store = transaction.objectStore(STATE_STORE);
  const { items, events, metadata, core } = splitState(value);
  store.clear();
  const updatedAt = value.updatedAt || new Date().toISOString();
  store.put({ key: NORMALIZED_CORE_KEY, value: core, updatedAt });
  store.put({ key: NORMALIZED_EVENTS_KEY, value: events, updatedAt });
  store.put({ key: NORMALIZED_HEADER_KEY, updatedAt, metadataNormalized: true });
  for (const [name, entry] of Object.entries(metadata)) {
    store.put({ key: `${METADATA_PREFIX}${name}`, name, value: entry, updatedAt });
  }
  for (const [id, item] of Object.entries(items)) {
    store.put({ key: `${ITEM_PREFIX}${id}`, id, value: item, updatedAt: value.updatedAt || new Date().toISOString() });
  }
  await done;
  normalizedMetadataReady = true;
  return true;
}

export async function normalizeMetadataStorage(value) {
  if (normalizedMetadataReady) return false;
  const database = await openDatabase();
  if (!database) return false;
  const transaction = database.transaction(STATE_STORE, "readwrite");
  const done = transactionDone(transaction);
  const store = transaction.objectStore(STATE_STORE);
  const { metadata, core } = splitState(value);
  const updatedAt = value.updatedAt || new Date().toISOString();

  store.put({ key: NORMALIZED_CORE_KEY, value: core, updatedAt });
  store.delete(metadataRange());
  for (const [name, entry] of Object.entries(metadata)) {
    store.put({ key: `${METADATA_PREFIX}${name}`, name, value: entry, updatedAt });
  }
  store.put({ key: NORMALIZED_HEADER_KEY, updatedAt, metadataNormalized: true });
  await done;
  normalizedMetadataReady = true;
  return true;
}

export async function writeStateDelta(value, changes = {}) {
  const database = await openDatabase();
  if (!database) return false;
  if (changes.allItems) return writePrimaryState(value);
  if (!normalizedMetadataReady) await normalizeMetadataStorage(value);

  const transaction = database.transaction(STATE_STORE, "readwrite");
  const done = transactionDone(transaction);
  const store = transaction.objectStore(STATE_STORE);
  const updatedAt = value.updatedAt || new Date().toISOString();
  store.put({ key: NORMALIZED_HEADER_KEY, updatedAt, metadataNormalized: true });

  if (changes.core) {
    const { core } = splitState(value);
    store.put({ key: NORMALIZED_CORE_KEY, value: core, updatedAt });
  }

  if (changes.metadataAll) {
    store.delete(metadataRange());
    for (const [name, entry] of Object.entries(value.metadata || {})) {
      store.put({ key: `${METADATA_PREFIX}${name}`, name, value: entry, updatedAt });
    }
  } else {
    for (const name of changes.metadataKeys || []) {
      if (Object.prototype.hasOwnProperty.call(value.metadata || {}, name)) {
        store.put({ key: `${METADATA_PREFIX}${name}`, name, value: value.metadata[name], updatedAt });
      } else {
        store.delete(`${METADATA_PREFIX}${name}`);
      }
    }
  }

  if (changes.events) store.put({ key: NORMALIZED_EVENTS_KEY, value: value.events || [], updatedAt });
  for (const id of changes.itemIds || []) {
    const item = value.items?.[id];
    if (item) store.put({ key: `${ITEM_PREFIX}${id}`, id, value: item, updatedAt });
    else store.delete(`${ITEM_PREFIX}${id}`);
  }
  await done;
  return true;
}

export async function createSnapshot(value, options = {}) {
  const database = await openDatabase();
  if (!database) return null;
  const createdAt = new Date().toISOString();
  const id = options.id || `snapshot_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  const record = {
    id,
    createdAt,
    kind: options.kind || "manual",
    label: options.label || "Manual archive snapshot",
    protected: Boolean(options.protected),
    schemaVersion: value.schemaVersion,
    itemCount: Object.keys(value.items || {}).length,
    eventCount: value.events?.length || 0,
    value: structuredClone(value)
  };
  const transaction = database.transaction(SNAPSHOT_STORE, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(SNAPSHOT_STORE).put(record);
  await done;
  return { ...record, value: undefined };
}

export async function listSnapshots() {
  const database = await openDatabase();
  if (!database) return [];
  const transaction = database.transaction(SNAPSHOT_STORE, "readonly");
  const done = transactionDone(transaction);
  const records = await requestResult(transaction.objectStore(SNAPSHOT_STORE).getAll());
  await done;
  return records
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(({ value, ...manifest }) => manifest);
}

export async function readSnapshot(id) {
  const database = await openDatabase();
  if (!database) return null;
  const transaction = database.transaction(SNAPSHOT_STORE, "readonly");
  const done = transactionDone(transaction);
  const record = await requestResult(transaction.objectStore(SNAPSHOT_STORE).get(id));
  await done;
  return record || null;
}

export async function deleteSnapshot(id) {
  const database = await openDatabase();
  if (!database) return false;
  const transaction = database.transaction(SNAPSHOT_STORE, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(SNAPSHOT_STORE).delete(id);
  await done;
  return true;
}

export async function ensureDailySnapshot(value, limit = 30) {
  const snapshots = await listSnapshots();
  const today = new Date().toISOString().slice(0, 10);
  const existing = snapshots.find(snapshot => snapshot.kind === "daily" && snapshot.createdAt.slice(0, 10) === today);
  if (!existing) {
    await createSnapshot(value, {
      kind: "daily",
      label: `Daily archive snapshot — ${today}`,
      protected: false
    });
  }
  const daily = (await listSnapshots()).filter(snapshot => snapshot.kind === "daily" && !snapshot.protected);
  for (const snapshot of daily.slice(limit)) await deleteSnapshot(snapshot.id);
  return listSnapshots();
}

export async function databaseEstimate() {
  const estimate = await navigator.storage?.estimate?.();
  return {
    database: DATABASE_NAME,
    supported: Boolean(await openDatabase()),
    usage: estimate?.usage || 0,
    quota: estimate?.quota || 0
  };
}
