// 把 C++ 編譯結果存在 IndexedDB，重新整理或隔天再開都不必重新編譯（手機上編譯一個檔案可能要數分鐘）
// 依「最近使用時間」淘汰，總大小超過上限時刪除最久沒用的

const DB_NAME = 'webtaskmaker-cpp-cache';
const STORE = 'wasm';
const MAX_BYTES = 50 * 1024 * 1024;

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 把很長的鍵（編譯參數 + 原始碼）縮成 SHA-256；不支援時直接用原字串 */
export async function cacheKey(text) {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return text;
  }
}

/** 取得快取的 wasm（Uint8Array），沒有則回傳 null；任何錯誤都視為沒有快取 */
export async function getCached(key) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const rec = await promisify(store.get(key));
    if (!rec) return null;
    rec.used = Date.now();
    store.put(rec);
    return new Uint8Array(rec.wasm);
  } catch {
    return null;
  }
}

/** 存入快取並淘汰最久沒用的項目；失敗時略過（例如無痕模式或空間不足） */
export async function putCached(key, wasm) {
  try {
    const db = await openDb();
    const buf = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);
    {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key, wasm: buf, size: buf.byteLength, used: Date.now() });
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    }
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const all = await promisify(store.getAll());
    let total = all.reduce((a, r) => a + (r.size || 0), 0);
    for (const r of all.sort((a, b) => a.used - b.used)) {
      if (total <= MAX_BYTES) break;
      if (r.key === key) continue;
      store.delete(r.key);
      total -= r.size || 0;
    }
  } catch {
    /* 略過 */
  }
}
