// C++ 編譯 Worker（spec §14.1、§14.2）：載入 WASM 版 clang 並重複使用
import stdcppH from '../runtime/cpp/bits/stdc++.h?raw';
import testlibH from '../runtime/cpp/testlib.h?raw';

let clangPromise = null;
let clangBase = null; // 由主執行緒在 init 時傳入
let resourcesPromise = null;

function loadClang() {
  if (!clangPromise) {
    clangPromise = import(/* @vite-ignore */ clangBase + 'bundle.js').catch((e) => {
      clangPromise = null;
      throw e;
    });
  }
  return clangPromise;
}

/**
 * 預先下載編譯器的資源檔並回報進度。
 * runClang 內部會先執行一次 clang -###，而那一次不會把 fetchProgress 傳下去，
 * 所以必須自己先以 runClang(null, ...) 觸發下載，進度才會回報到這裡。
 */
function loadResources() {
  if (!resourcesPromise) {
    resourcesPromise = (async () => {
      const { runClang } = await loadClang();
      let lastPct = -1;
      await runClang(null, {}, {
        fetchProgress: ({ doneLength, totalLength }) => {
          const pct = totalLength ? Math.floor((doneLength / totalLength) * 100) : 0;
          if (pct !== lastPct) {
            lastPct = pct;
            self.postMessage({ type: 'progress', done: doneLength, total: totalLength });
          }
        },
      });
    })().catch((e) => {
      resourcesPromise = null;
      throw e;
    });
  }
  return resourcesPromise;
}

const headers = { 'testlib.h': testlibH, bits: { 'stdc++.h': stdcppH } };

function concat(chunks) {
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

async function compile({ src, filename, compileFlags, linkFlags }) {
  const { runClang } = await loadClang();
  await loadResources();
  self.postMessage({ type: 'compiling' });
  const dec = new TextDecoder();
  let stderr = '';
  const onErr = (b) => { if (b) stderr += dec.decode(b, { stream: true }); };
  const name = /^[\w.-]+\.(cpp|cc|cxx)$/.test(filename) ? filename : 'main.cpp';
  const objName = name.replace(/\.[^.]+$/, '.o');

  // 兩段式編譯：目的檔輸出到 stdout，避開虛擬檔案系統寫入大檔極慢的問題
  const chunks = [];
  try {
    await runClang(['clang++', ...compileFlags, '-I.', '-c', name, '-o', '-'], { [name]: src, ...headers },
      { stdout: (b) => { if (b) chunks.push(b.slice()); }, stderr: onErr });
  } catch (e) {
    if (e?.code === undefined && !stderr) throw e; // 不是編譯錯誤（例如載入失敗）
    return { ok: false, error: stderr.trim() || e.message };
  }
  try {
    const out = await runClang(['clang++', ...linkFlags, objName, '-o', 'a.wasm'], { [objName]: concat(chunks) }, { stderr: onErr });
    return { ok: true, wasm: out['a.wasm'], warnings: stderr.trim() };
  } catch (e) {
    return { ok: false, error: stderr.trim() || e.message };
  }
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    clangBase = msg.clangBase;
    try {
      await loadClang();
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'init-error', error: String(err?.message || err) });
    }
  } else if (msg.type === 'compile') {
    let result;
    try {
      result = await compile(msg.req);
    } catch (err) {
      result = { ok: false, error: `編譯器執行失敗：${err?.message || err}`, internal: true };
    }
    self.postMessage({ type: 'result', id: msg.id, result }, result.wasm ? [result.wasm.buffer] : []);
  }
};
