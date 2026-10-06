// Small IndexedDB wrapper. The workspace lives in projects/sources/cards/meta; full source
// text lives in `texts` (keyed by sourceId) so it is written once, not on every save.
// embeddings, edges, annotations, and versions are created now and filled by later parts.
const DB_NAME = "lattice";
const DB_VERSION = 1;
export const workspaceStores = ["projects", "sources", "cards", "meta"];
export const allStores = [...workspaceStores, "texts", "embeddings", "edges", "annotations", "versions"];

let opening = null;
function open() {
  opening ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("projects", { keyPath: "id" });
      db.createObjectStore("sources", { keyPath: ["projectId", "id"] });
      db.createObjectStore("cards", { keyPath: ["projectId", "id"] });
      db.createObjectStore("meta", { keyPath: "key" });
      db.createObjectStore("texts", { keyPath: "sourceId" });
      for (const name of ["embeddings", "edges", "annotations", "versions"]) db.createObjectStore(name, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

const done = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new DOMException("Transaction aborted", "AbortError"));
});
const result = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

// Reads every record of the given stores: { storeName: [records] }.
export async function readStores(names) {
  const db = await open();
  const tx = db.transaction(names, "readonly");
  const entries = await Promise.all(names.map(async name => [name, await result(tx.objectStore(name).getAll())]));
  return Object.fromEntries(entries);
}

// Replaces the contents of the given stores in one transaction.
export async function replaceStores(records) {
  const db = await open();
  const names = Object.keys(records);
  const tx = db.transaction(names, "readwrite");
  for (const name of names) {
    const store = tx.objectStore(name);
    store.clear();
    for (const record of records[name]) store.put(record);
  }
  return done(tx);
}

// Saves the workspace records and drops texts whose source no longer exists.
export async function saveWorkspaceRecords(records) {
  const db = await open();
  const tx = db.transaction([...workspaceStores, "texts"], "readwrite");
  for (const name of workspaceStores) {
    const store = tx.objectStore(name);
    store.clear();
    for (const record of records[name]) store.put(record);
  }
  const live = new Set(records.sources.map(source => source.id));
  const texts = tx.objectStore("texts");
  texts.getAllKeys().onsuccess = event => event.target.result.forEach(key => { if (!live.has(key)) texts.delete(key); });
  return done(tx);
}

export async function putText(sourceId, pages) {
  const db = await open();
  const tx = db.transaction("texts", "readwrite");
  tx.objectStore("texts").put({ sourceId, pages: pages.map(({ label, text }) => ({ label, text: String(text) })) });
  return done(tx);
}

export async function getText(sourceId) {
  const db = await open();
  return result(db.transaction("texts").objectStore("texts").get(sourceId));
}

export async function clearAll() {
  return replaceStores(Object.fromEntries(allStores.map(name => [name, []])));
}

// Records of one project in a store keyed by `id` (embeddings, edges).
export async function readProjectRecords(name, projectId) {
  const db = await open();
  const records = await result(db.transaction(name).objectStore(name).getAll());
  return records.filter(record => record.projectId === projectId);
}

export async function putRecords(name, records) {
  if (!records.length) return;
  const db = await open();
  const tx = db.transaction(name, "readwrite");
  for (const record of records) tx.objectStore(name).put(record);
  return done(tx);
}

export async function deleteRecords(name, ids) {
  if (!ids.length) return;
  const db = await open();
  const tx = db.transaction(name, "readwrite");
  for (const id of ids) tx.objectStore(name).delete(id);
  return done(tx);
}
