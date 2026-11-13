// 管理執行使用者程式的 Web Worker，處理逾時與中止（spec §7.1、§7.2、§14）
import { CPP_COMPILE_FLAGS, CPP_LINK_FLAGS, CPP_COMPILE_TIMEOUT_MS } from './config.js';

export function langOf(filename) {
  if (/\.py$/i.test(filename)) return 'py';
  if (/\.(m?js)$/i.test(filename)) return 'js';
  if (/\.(cpp|cc|cxx)$/i.test(filename)) return 'cpp';
  return null;
}

export const LANG_LABELS = { py: 'Python', js: 'JavaScript', cpp: 'C++' };

// 每種 Worker：js / py 直接執行程式；cppc 編譯 C++；cppx 執行編譯好的 C++
function createWorker(kind) {
  // 用 new URL(..., import.meta.url) 解析，部署在子路徑時也能正確載入
  switch (kind) {
    case 'py': return new Worker(new URL('../workers/py.worker.js', import.meta.url), { type: 'module' });
    case 'cppc': return new Worker(new URL('../workers/cppc.worker.js', import.meta.url), { type: 'module' });
    case 'cppx': return new Worker(new URL('../workers/cppx.worker.js', import.meta.url), { type: 'module' });
    default: return new Worker(new URL('../workers/js.worker.js', import.meta.url), { type: 'module' });
  }
}

const EMPTY = { stdout: '', out2: '', stderr: '' };

function stoppedError() {
  const err = new Error('已停止');
  err.stopped = true;
  return err;
}

export class Runner {
  /** onStatus(status, detail)：status 為 idle / loading-python / loading-cpp / compiling-cpp */
  constructor({ onStatus } = {}) {
    this.entries = {};
    this.pending = new Map();
    this.nextId = 1;
    this.onStatus = onStatus ?? (() => {});
    this.cppCache = new Map();
  }

  _entry(kind) {
    if (this.entries[kind]) return this.entries[kind];
    const w = createWorker(kind);
    const entry = { w, kind, isReady: false, sentKeys: new Set() };
    entry.ready = new Promise((resolve, reject) => {
      entry.resolveReady = resolve;
      entry.rejectReady = reject;
    });
    entry.ready.catch(() => {});
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') entry.resolveReady();
      else if (m.type === 'init-error') {
        entry.rejectReady(new Error(m.error));
        this._drop(kind, entry);
      } else if (m.type === 'progress') {
        const pct = m.total ? Math.floor((m.done / m.total) * 100) : 0;
        this.onStatus(pct >= 100 ? 'compiling-cpp' : 'loading-cpp', pct);
      } else if (m.type === 'result') {
        const p = this.pending.get(m.id);
        if (p) { this.pending.delete(m.id); p.resolve(m.result); }
      }
    };
    w.onerror = (e) => {
      e.preventDefault?.();
      const message = e.message || 'Worker 發生錯誤';
      entry.rejectReady(new Error(message));
      for (const [id, p] of this.pending) {
        if (p.entry === entry) { this.pending.delete(id); p.resolve(p.onError(message)); }
      }
      this._drop(kind, entry);
    };
    w.postMessage({ type: 'init' });
    this.entries[kind] = entry;
    return entry;
  }

  _drop(kind, entry) {
    if (this.entries[kind] === entry) this.entries[kind] = null;
    entry.w.terminate();
  }

  async _ready(kind) {
    const entry = this._entry(kind);
    if (entry.isReady) return entry;
    if (kind === 'py') this.onStatus('loading-python');
    if (kind === 'cppc') this.onStatus('loading-cpp', 0);
    try {
      await entry.ready;
      entry.isReady = true;
    } finally {
      if (kind === 'py' || kind === 'cppc') this.onStatus('idle');
    }
    return entry;
  }

  /** 送出一個請求；逾時則終止該 Worker */
  _request(entry, msg, timeoutMs, { onTimeout, onError, transfer = [] }) {
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this._drop(entry.kind, entry);
        resolve(onTimeout());
      }, timeoutMs);
      this.pending.set(id, {
        entry,
        onError,
        resolve: (r) => { clearTimeout(timer); resolve(r); },
      });
      entry.w.postMessage({ ...msg, id }, transfer);
    });
  }

  async _readyOrResult(kind, label) {
    try {
      return { entry: await this._ready(kind) };
    } catch (e) {
      if (e.stopped) return { result: { status: 'stopped', message: '已停止', ...EMPTY } };
      return { result: { status: 'error', message: `${label} 執行環境載入失敗：${e.message}`, ...EMPTY } };
    }
  }

  /** 預先載入某語言的執行環境 */
  async warmup(lang) {
    await this._ready(lang === 'cpp' ? 'cppc' : lang);
  }

  /**
   * 編譯 C++，結果依「編譯參數 + 原始碼」快取（spec §14.2）。
   * 回傳 { ok: true, key, wasm } 或 { ok: false, error, stopped? }
   */
  compileCpp(code, filename) {
    const key = `${CPP_COMPILE_FLAGS.join(' ')}\n${CPP_LINK_FLAGS.join(' ')}\n${code}`;
    if (!this.cppCache.has(key)) {
      const p = this._compileCpp(code, filename).then((r) => {
        // 停止、逾時或內部錯誤不快取，下次重新編譯
        if (r.stopped || r.internal) this.cppCache.delete(key);
        return r.ok ? { ...r, key } : r;
      });
      this.cppCache.set(key, p);
    }
    return this.cppCache.get(key);
  }

  async _compileCpp(code, filename) {
    const { entry, result } = await this._readyOrResult('cppc', 'C++ 編譯器');
    if (!entry) return { ok: false, error: result.message, stopped: result.status === 'stopped', internal: true };
    this.onStatus('compiling-cpp', filename);
    try {
      return await this._request(entry, {
        type: 'compile',
        req: { src: code, filename, compileFlags: CPP_COMPILE_FLAGS, linkFlags: CPP_LINK_FLAGS },
      }, CPP_COMPILE_TIMEOUT_MS, {
        onTimeout: () => ({ ok: false, error: `編譯超過 ${CPP_COMPILE_TIMEOUT_MS / 1000} 秒`, internal: true }),
        onError: (message) => ({ ok: false, error: `編譯器發生錯誤：${message}`, internal: true }),
      });
    } finally {
      this.onStatus('idle');
    }
  }

  /**
   * 執行一段程式。回傳結果中 status 可能為 ok / error / tle / stopped。
   * 逾時計時在執行環境就緒（C++ 為編譯完成）後才開始。
   */
  async run(lang, req, timeoutMs) {
    let kind = lang;
    let msgReq = req;
    if (lang === 'cpp') {
      const c = await this.compileCpp(req.code, req.filename);
      if (!c.ok) {
        if (c.stopped) return { status: 'stopped', message: '已停止', ...EMPTY };
        return { status: 'error', compileError: true, message: `編譯錯誤：\n${c.error}`, ...EMPTY };
      }
      kind = 'cppx';
      msgReq = { ...req, code: undefined, key: c.key };
    }
    const { entry, result } = await this._readyOrResult(kind, LANG_LABELS[lang] ?? lang);
    if (!entry) return result;
    if (kind === 'cppx') {
      // 同一個 Worker 已收過的程式不必重送（Worker 內會快取編譯好的模組）
      const c = await this.compileCpp(req.code, req.filename);
      if (!entry.sentKeys.has(c.key)) {
        msgReq.wasm = c.wasm;
        entry.sentKeys.add(c.key);
      }
    }
    const send = () => this._request(entry, { type: 'run', req: msgReq }, timeoutMs, {
      onTimeout: () => ({ status: 'tle', message: `執行超過 ${timeoutMs / 1000} 秒`, time: timeoutMs, ...EMPTY }),
      onError: (message) => ({ status: 'error', message, ...EMPTY }),
    });
    let res = await send();
    if (res.missingModule && kind === 'cppx') {
      // Worker 沒有快取到模組（例如先前載入失敗），附上程式重送一次
      msgReq.wasm = (await this.compileCpp(req.code, req.filename)).wasm;
      res = await send();
    }
    return res;
  }

  /** 中止所有執行中的程式（終止 Worker，下次使用時會重新建立） */
  stop() {
    for (const kind of Object.keys(this.entries)) {
      const entry = this.entries[kind];
      if (entry) {
        entry.rejectReady(stoppedError());
        this._drop(kind, entry);
      }
    }
    for (const [id, p] of this.pending) {
      this.pending.delete(id);
      p.resolve(p.entry.kind === 'cppc'
        ? { ok: false, error: '已停止', stopped: true }
        : { status: 'stopped', message: '已停止', ...EMPTY });
    }
    this.onStatus('idle');
  }
}
