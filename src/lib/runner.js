// 管理執行使用者程式的 Web Worker，處理逾時與中止（spec §7.1、§7.2）

export function langOf(filename) {
  if (/\.py$/i.test(filename)) return 'py';
  if (/\.(m?js)$/i.test(filename)) return 'js';
  return null;
}

function createWorker(lang) {
  // 用 new URL(..., import.meta.url) 解析，部署在子路徑時也能正確載入
  if (lang === 'py') return new Worker(new URL('../workers/py.worker.js', import.meta.url), { type: 'module' });
  return new Worker(new URL('../workers/js.worker.js', import.meta.url), { type: 'module' });
}

export class Runner {
  constructor({ onStatus } = {}) {
    this.entries = { js: null, py: null };
    this.pending = new Map();
    this.nextId = 1;
    this.onStatus = onStatus ?? (() => {});
  }

  _entry(lang) {
    if (this.entries[lang]) return this.entries[lang];
    const w = createWorker(lang);
    const entry = { w, lang };
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
        this._drop(lang, entry);
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
        if (p.entry === entry) { this.pending.delete(id); p.resolve({ status: 'error', message, stdout: '', out2: '', stderr: '' }); }
      }
      this._drop(lang, entry);
    };
    w.postMessage({ type: 'init' });
    this.entries[lang] = entry;
    return entry;
  }

  _drop(lang, entry) {
    if (this.entries[lang] === entry) this.entries[lang] = null;
    entry.w.terminate();
  }

  /** 預先載入某語言的執行環境 */
  async warmup(lang) {
    const entry = this._entry(lang);
    if (entry.isReady) return;
    if (lang === 'py') this.onStatus('loading-python');
    try {
      await entry.ready;
      entry.isReady = true;
    } finally {
      if (lang === 'py') this.onStatus('idle');
    }
  }

  /**
   * 執行一段程式。回傳結果中 status 可能為 ok / error / tle / stopped。
   * 逾時計時在執行環境就緒後才開始。
   */
  async run(lang, req, timeoutMs) {
    try {
      await this.warmup(lang);
    } catch (e) {
      const empty = { stdout: '', out2: '', stderr: '' };
      if (e.stopped) return { status: 'stopped', message: '已停止', ...empty };
      return { status: 'error', message: `${lang === 'py' ? 'Python' : 'JavaScript'} 執行環境載入失敗：${e.message}`, ...empty };
    }
    const entry = this.entries[lang];
    if (!entry) return { status: 'stopped', stdout: '', out2: '', stderr: '' };
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this._drop(lang, entry);
        resolve({ status: 'tle', message: `執行超過 ${timeoutMs / 1000} 秒`, time: timeoutMs, stdout: '', out2: '', stderr: '' });
      }, timeoutMs);
      this.pending.set(id, {
        entry,
        resolve: (r) => { clearTimeout(timer); resolve(r); },
      });
      entry.w.postMessage({ type: 'run', id, req });
    });
  }

  /** 中止所有執行中的程式（終止 Worker，下次使用時會重新建立） */
  stop() {
    for (const lang of ['js', 'py']) {
      const entry = this.entries[lang];
      if (entry) {
        const err = new Error('已停止');
        err.stopped = true;
        entry.rejectReady(err);
        this._drop(lang, entry);
      }
    }
    for (const [id, p] of this.pending) {
      this.pending.delete(id);
      p.resolve({ status: 'stopped', message: '已停止', stdout: '', out2: '', stderr: '' });
    }
  }
}
