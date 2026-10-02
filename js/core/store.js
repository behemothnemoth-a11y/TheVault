import { CURRENT_SCHEMA_VERSION, migrateSave } from "./migrations.js";
import {
  createSnapshot,
  databaseEstimate,
  ensureDailySnapshot,
  listSnapshots,
  normalizeMetadataStorage,
  readPrimaryState,
  readSnapshot,
  writePrimaryState,
  writeStateDelta
} from "./database.js";

export const STORAGE_KEY = "vault_reconstruction_v1";
let state;
let persistenceQueue = Promise.resolve();
let mirrorTimer = null;
let desktopDirty = false;
const DESKTOP_MIRROR_STAMP_KEY = "vault_desktop_mirror_updated_at";
const subscribers = new Set();
const storageSubscribers = new Set();
const storageStatus = {
  engine: "initializing",
  ready: false,
  migratedFromLocalStorage: false,
  localStorageRollbackRetained: false,
  snapshotCount: 0,
  lastPersistedAt: null,
  lastError: null,
  saving: false,
  unsavedChanges: false,
  pendingWrites: 0,
  usage: 0,
  quota: 0
};

function now() {
  return new Date().toISOString();
}

function makeTrackedDraft(source) {
  const changes = {
    core: false,
    events: false,
    allItems: false,
    itemIds: new Set(),
    metadataAll: false,
    metadataKeys: new Set()
  };
  const proxyRecords = new WeakMap();
  let rootRecord = null;

  const mark = path => {
    if (path[0] === "items") {
      if (path.length < 2) changes.allItems = true;
      else changes.itemIds.add(String(path[1]));
    } else if (path[0] === "events") {
      changes.events = true;
    } else if (path[0] === "metadata") {
      if (path.length < 2) changes.metadataAll = true;
      else changes.metadataKeys.add(String(path[1]));
    } else {
      changes.core = true;
    }
  };

  const current = record => record.copy || record.base;
  const ensureCopy = record => {
    if (record.copy) return record.copy;
    record.copy = Array.isArray(record.base) ? record.base.slice() : { ...record.base };
    if (record.parent) ensureCopy(record.parent)[record.key] = record.copy;
    return record.copy;
  };

  const unwrap = value => {
    if (!value || typeof value !== "object") return value;
    if (proxyRecords.has(value)) return current(proxyRecords.get(value));
    if (Array.isArray(value)) return value.map(unwrap);
    if (Object.getPrototypeOf(value) === Object.prototype) {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, unwrap(entry)]));
    }
    return value;
  };

  const wrap = (base, parent = null, key = null, path = []) => {
    if (!base || typeof base !== "object") return base;
    const record = { base, copy: null, parent, key, path, proxy: null, children: new Map() };
    const proxy = new Proxy(base, {
      get(_target, property) {
        const value = current(record)[property];
        if (!value || typeof value !== "object") return value;
        const cached = record.children.get(property);
        if (cached?.base === value) return cached.proxy;
        const child = wrap(value, record, property, [...path, property]);
        const childRecord = proxyRecords.get(child);
        record.children.set(property, childRecord);
        return child;
      },
      set(_target, property, value) {
        mark([...path, property]);
        record.children.delete(property);
        Reflect.set(ensureCopy(record), property, unwrap(value));
        return true;
      },
      deleteProperty(_target, property) {
        mark([...path, property]);
        record.children.delete(property);
        return Reflect.deleteProperty(ensureCopy(record), property);
      },
      defineProperty(_target, property, descriptor) {
        mark([...path, property]);
        record.children.delete(property);
        const next = { ...descriptor };
        if ("value" in next) next.value = unwrap(next.value);
        return Reflect.defineProperty(ensureCopy(record), property, next);
      },
      ownKeys() { return Reflect.ownKeys(current(record)); },
      getOwnPropertyDescriptor(_target, property) {
        return Object.getOwnPropertyDescriptor(current(record), property);
      },
      has(_target, property) { return property in current(record); }
    });
    record.proxy = proxy;
    proxyRecords.set(proxy, record);
    if (!parent) rootRecord = record;
    return proxy;
  };

  const draft = wrap(source);
  return {
    draft,
    changes,
    finish(updatedAt = now()) {
      const raw = rootRecord.copy || { ...source };
      raw.updatedAt = updatedAt;
      return raw;
    }
  };
}

function notify() {
  subscribers.forEach(listener => listener(state));
}

function notifyStorage() {
  const snapshot = getStorageStatus();
  storageSubscribers.forEach(listener => listener(snapshot));
}

function queuePersistence(task) {
  storageStatus.pendingWrites += 1;
  storageStatus.saving = true;
  storageStatus.unsavedChanges = true;
  notifyStorage();
  persistenceQueue = persistenceQueue
    .then(task)
    .then(() => {
      storageStatus.lastError = null;
      storageStatus.lastPersistedAt = now();
    })
    .catch(error => {
      storageStatus.lastError = error.message;
      console.error("Vault persistence failed:", error);
    })
    .finally(() => {
      storageStatus.pendingWrites = Math.max(0, storageStatus.pendingWrites - 1);
      storageStatus.saving = storageStatus.pendingWrites > 0;
      storageStatus.unsavedChanges = Boolean(storageStatus.lastError) || storageStatus.pendingWrites > 0;
      notifyStorage();
    });
  return persistenceQueue;
}

async function refreshStorageStatus() {
  try {
    const [snapshots, estimate] = await Promise.all([listSnapshots(), databaseEstimate()]);
    storageStatus.snapshotCount = snapshots.length;
    storageStatus.usage = estimate.usage;
    storageStatus.quota = estimate.quota;
  } catch (error) {
    storageStatus.lastError = error.message;
  }
}

export function makeSave(sampleItems = {}) {
  const timestamp = now();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    profile: { name: "The Archivist", xp: 0, level: 1, title: "Shelf Dweller" },
    items: structuredClone(sampleItems),
    events: [],
    achievements: {},
    preferences: { theme: "archive", bootSeen: false },
    expeditions: {},
    metadata: {
      sampleData: true,
      lastOpenedAt: null,
      stage1: { startedAt: timestamp, durableStorage: true },
      stage2: {
        startedAt: timestamp,
        workbenchEnabled: true,
        changeLog: [],
        reviewBatches: [],
        lastMaintainedAt: null
      },
      reviewQueue: { schemaVersion: 1, updatedAt: null, items: [] }
    }
  };
}

export async function initStore(sampleItems) {
  const legacyRaw = localStorage.getItem(STORAGE_KEY);
  let databaseState = null;
  try {
    databaseState = await readPrimaryState();
    storageStatus.engine = "indexeddb";
  } catch (error) {
    storageStatus.engine = "localstorage-fallback";
    storageStatus.lastError = error.message;
  }

  // The mirror is the recovery copy, only read when this browser holds nothing of
  // its own. Fetching it on every start downloaded and parsed the whole archive —
  // 43 MB at present — before throwing it away, which is most of the wait.
  let mirrorState = null;
  const desktopMigration = Boolean(globalThis.vaultDesktopReady) && !localStorage.getItem("vaultDesktopArchiveMigrated");
  if (desktopMigration) {
    // Explicit, user-approved move to the desktop profile. Never silently fall
    // back to sample data if the migration source cannot be read.
    const response = await fetch("./__vault/state/mirror");
    if (!response.ok) throw new Error("The desktop archive migration source is unavailable.");
    mirrorState = (await response.json()).state;
    if (!mirrorState?.items || !Object.keys(mirrorState.items).length) throw new Error("The desktop migration source is empty.");
    if (databaseState?.items) await createSnapshot(databaseState, {kind:"migration",label:"Before desktop archive transfer",protected:true});
    databaseState = null;
  }
  if (!desktopMigration && !databaseState && !legacyRaw) {
    try { const response=await fetch("./__vault/state/mirror");if(response.ok)mirrorState=(await response.json()).state; } catch {}
  }
  if (desktopMigration || !databaseState && !legacyRaw && mirrorState?.items) {
    state = migrateSave(mirrorState);
  } else if (databaseState) {
    state = migrateSave(databaseState);
  } else if (legacyRaw) {
    state = migrateSave(JSON.parse(legacyRaw));
    storageStatus.migratedFromLocalStorage = storageStatus.engine === "indexeddb";
    storageStatus.localStorageRollbackRetained = true;
    if (storageStatus.engine === "indexeddb") {
      await createSnapshot(state, {
        kind: "migration",
        label: "Protected localStorage migration snapshot",
        protected: true
      });
    }
  } else {
    state = makeSave(sampleItems);
  }

  state.updatedAt ||= now();
  state.metadata ||= {};
  state.metadata.stage1 ||= {};
  state.metadata.stage2 ||= {
    startedAt: now(),
    workbenchEnabled: true,
    changeLog: [],
    reviewBatches: [],
    lastMaintainedAt: null
  };
  state.metadata.stage1.storage = {
    engine: storageStatus.engine,
    migratedFromLocalStorage: storageStatus.migratedFromLocalStorage,
    localStorageRollbackRetained: storageStatus.localStorageRollbackRetained,
    initializedAt: now()
  };

  if (storageStatus.engine === "indexeddb") {
    if (!globalThis.vaultDesktopReady || desktopMigration) await writePrimaryState(state);
    await normalizeMetadataStorage(state);
    if (!globalThis.vaultDesktopReady) await ensureDailySnapshot(state, 30);
    storageStatus.lastPersistedAt = now();
    await refreshStorageStatus();
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  storageStatus.ready = true;
  if (desktopMigration) localStorage.setItem("vaultDesktopArchiveMigrated", "1");

  if (globalThis.vaultDesktopReady && storageStatus.engine === "indexeddb") {
    const mirroredAt = localStorage.getItem(DESKTOP_MIRROR_STAMP_KEY) || "";
    if (mirroredAt !== state.updatedAt) {
      desktopDirty = true;
      scheduleStateMirror(state, 5000);
    }
    setTimeout(async () => {
      try {
        await ensureDailySnapshot(state, 30);
        await refreshStorageStatus();
      } catch (error) {
        console.error("Daily Vault snapshot paused:", error);
      }
    }, 15000);
  } else {
    scheduleStateMirror(state, 0);
  }
  return state;
}

function scheduleStateMirror(value, delay = 1200) {
  clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => {
    mirrorTimer = null;
    return fetch("./__vault/state/mirror", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault-Request": "state-mirror" },
      body: JSON.stringify({ state: value })
    }).then(response => {
      if (!response.ok) return;
      try { localStorage.setItem(DESKTOP_MIRROR_STAMP_KEY, value.updatedAt || ""); } catch {}
      if (globalThis.vaultDesktopReady && state === value) desktopDirty = false;
    }).catch(() => {});
  }, delay);
}

export function getState() {
  return state;
}

export function getStorageStatus() {
  return { ...storageStatus };
}

export function subscribeStorage(listener) {
  storageSubscribers.add(listener);
  listener(getStorageStatus());
  return () => storageSubscribers.delete(listener);
}

export function update(mutator, options = {}) {
  const tracked = makeTrackedDraft(state);
  const { draft, changes } = tracked;
  mutator(draft);
  state = tracked.finish();
  if (options.persist !== false) persist(changes);
  notify();
  return state;
}

export function persist(changes = { core: true, events: true, allItems: true, itemIds: new Set() }) {
  const captured = state;
  if (globalThis.vaultDesktopReady) {
    desktopDirty = true;
    if (storageStatus.engine === "indexeddb") {
      return queuePersistence(async () => {
        await writeStateDelta(captured, {
          core: changes.core !== false,
          events: Boolean(changes.events),
          allItems: Boolean(changes.allItems),
          itemIds: [...(changes.itemIds || [])],
          metadataAll: Boolean(changes.metadataAll),
          metadataKeys: [...(changes.metadataKeys || [])]
        });
        storageStatus.lastPersistedAt = now();
      }).then(() => scheduleStateMirror(captured, 8000));
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(captured));
      storageStatus.lastPersistedAt = now();
      scheduleStateMirror(captured, 8000);
    } catch (error) {
      storageStatus.lastError = error.message;
      throw error;
    }
    return Promise.resolve();
  }
  scheduleStateMirror(captured);
  if (storageStatus.engine === "indexeddb") {
    return queuePersistence(async () => {
      await writeStateDelta(captured, {
        core: changes.core !== false,
        events: Boolean(changes.events),
        allItems: Boolean(changes.allItems),
        itemIds: [...(changes.itemIds || [])],
        metadataAll: Boolean(changes.metadataAll),
        metadataKeys: [...(changes.metadataKeys || [])]
      });
      storageStatus.lastPersistedAt = now();
    });
  }
  try {
    storageStatus.saving = true;
    storageStatus.unsavedChanges = true;
    notifyStorage();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(captured));
    storageStatus.lastPersistedAt = now();
    storageStatus.lastError = null;
  } catch (error) {
    storageStatus.lastError = error.message;
    throw error;
  } finally {
    storageStatus.saving = false;
    storageStatus.unsavedChanges = Boolean(storageStatus.lastError);
    notifyStorage();
  }
  return Promise.resolve();
}

export async function retryPersistence() {
  await flushPersistence();
  storageStatus.lastError = null;
  storageStatus.unsavedChanges = true;
  notifyStorage();
  return persist({ core: true, events: true, allItems: true, itemIds: new Set() });
}

export function subscribe(listener) {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

export async function replaceState(nextState, options = {}) {
  const previous = structuredClone(state);
  const next = migrateSave(nextState);
  next.updatedAt = now();
  if (storageStatus.engine === "indexeddb") {
    await flushPersistence();
    try {
      await createSnapshot(previous, {
        kind: options.kind || "import",
        label: options.snapshotLabel || "Protected snapshot before archive replacement",
        protected: true
      });
      await writePrimaryState(next);
      storageStatus.lastPersistedAt = now();
      await refreshStorageStatus();
    } catch (error) {
      storageStatus.lastError = error.message;
      throw error;
    }
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    storageStatus.lastPersistedAt = now();
  }
  state = next;
  notify();
  return state;
}

export async function createArchiveSnapshot(label = "Manual archive snapshot", options = {}) {
  await flushPersistence();
  const snapshot = await createSnapshot(state, {
    kind: options.kind || "manual",
    label,
    protected: options.protected ?? true
  });
  await refreshStorageStatus();
  return snapshot;
}

export async function getArchiveSnapshots() {
  await flushPersistence();
  return listSnapshots();
}

export async function restoreArchiveSnapshot(id) {
  await flushPersistence();
  const record = await readSnapshot(id);
  if (!record?.value) throw new Error("Snapshot data was not found.");
  const current = structuredClone(state);
  await createSnapshot(current, {
    kind: "pre_restore",
    label: `Protected snapshot before restoring ${id}`,
    protected: true
  });
  state = migrateSave(record.value);
  state.updatedAt = now();
  await writePrimaryState(state);
  storageStatus.lastPersistedAt = now();
  await refreshStorageStatus();
  notify();
  return state;
}

export async function flushPersistence() {
  await globalThis.__vaultActiveJobControl?.checkpoint?.();
  return persistenceQueue;
}

export async function saveDesktopOnClose(onProgress = async () => {}) {
  await onProgress('Finishing pending changes…');
  clearTimeout(mirrorTimer);
  mirrorTimer = null;
  await flushPersistence();
  if (!storageStatus.ready) return;
  storageStatus.lastPersistedAt = now();
  await onProgress('Saved. Closing Vault…');
}

export function recordEvent(event) {
  update(save => {
    save.events.push(event);
    if (save.events.length > 25000) save.events = save.events.slice(-25000);
  });
}

export function exportSave() {
  return JSON.stringify(state, null, 2);
}
