// 專案的自動儲存（spec §10）：IndexedDB，每個檔案一筆資料，專案設定另存一筆
import { normalizeProject, loadLegacyProject, clearLegacyProject } from './project.js';

const DB_NAME = 'webtaskmaker-project';
const FILES = 'files';
const META = 'meta';
const META_KEY = 'project';

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('此瀏覽器不支援 IndexedDB')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('資料庫被其他分頁占用'));
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('寫入被中止'));
  });
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 專案中的檔案轉成要儲存的資料 */
export function fileRecord(f) {
  const rec = { id: f.id, role: f.role, name: f.name, content: f.content };
  if (f.expected !== undefined) rec.expected = f.expected;
  return rec;
}

export function metaRecord(p) {
  return {
    key: META_KEY,
    version: 1,
    mode: p.mode,
    planFormat: p.planFormat,
    timeoutSec: p.timeoutSec,
    order: p.files.map((f) => f.id),
  };
}

/**
 * 讀取專案；沒有時嘗試搬移 localStorage 中的舊版專案（搬移成功後刪除舊資料）。
 * 回傳 { project, migrated } 或 null
 */
export async function loadProject() {
  const db = await openDb();
  const tx = db.transaction([FILES, META], 'readonly');
  const [meta, files] = await Promise.all([
    request(tx.objectStore(META).get(META_KEY)),
    request(tx.objectStore(FILES).getAll()),
  ]);
  if (meta) {
    const byId = new Map(files.map((f) => [f.id, f]));
    const ordered = (meta.order ?? []).map((id) => byId.get(id)).filter(Boolean);
    // 不在順序表中的檔案（例如寫入到一半）接在後面，避免遺失
    for (const f of files) if (!meta.order?.includes(f.id)) ordered.push(f);
    return { project: normalizeProject({ ...meta, files: ordered }), migrated: false };
  }
  const legacy = loadLegacyProject();
  if (legacy) {
    await replaceAll(legacy);
    clearLegacyProject();
    return { project: legacy, migrated: true };
  }
  return null;
}

/** 整個專案重新寫入（載入範例、上傳專案、新專案時使用） */
export async function replaceAll(project) {
  const db = await openDb();
  const tx = db.transaction([FILES, META], 'readwrite');
  const files = tx.objectStore(FILES);
  files.clear();
  for (const f of project.files) files.put(fileRecord(f));
  tx.objectStore(META).put(metaRecord(project));
  await done(tx);
}

/** 只寫入有變動的部分：{ meta, put: [fileRecord], del: [id] } */
export async function writeChanges({ meta, put = [], del = [] }) {
  const db = await openDb();
  const tx = db.transaction([FILES, META], 'readwrite');
  const files = tx.objectStore(FILES);
  for (const rec of put) files.put(rec);
  for (const id of del) files.delete(id);
  if (meta) tx.objectStore(META).put(meta);
  await done(tx);
}

/** 向瀏覽器申請持久儲存，降低資料被自動清除的機會（瀏覽器不一定會同意） */
export async function requestPersist() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
