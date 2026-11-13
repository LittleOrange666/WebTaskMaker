// C++ 編譯 Worker（spec §14.1、§14.2）：載入 WASM 版 clang 並重複使用
import stdcppH from '../runtime/cpp/bits/stdc++.h?raw';
import testlibH from '../runtime/cpp/testlib.h?raw';
import { CLANG_BASE } from '../lib/config.js';

let clangPromise = null;
function loadClang() {
  if (!clangPromise) {
    clangPromise = import(/* @vite-ignore */ CLANG_BASE + 'bundle.js').catch((e) => {
      clangPromise = null;
      throw e;
    });
  }
  return clangPromise;
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
  const dec = new TextDecoder();
  let stderr = '';
  const onErr = (b) => { if (b) stderr += dec.decode(b, { stream: true }); };
  const fetchProgress = (e) => self.postMessage({ type: 'progress', done: e.doneLength, total: e.totalLength });
  const name = /^[\w.-]+\.(cpp|cc|cxx)$/.test(filename) ? filename : 'main.cpp';
  const objName = name.replace(/\.[^.]+$/, '.o');

  // 兩段式編譯：目的檔輸出到 stdout，避開虛擬檔案系統寫入大檔極慢的問題
  const chunks = [];
  try {
    await runClang(['clang++', ...compileFlags, '-I.', '-c', name, '-o', '-'], { [name]: src, ...headers },
      { stdout: (b) => { if (b) chunks.push(b.slice()); }, stderr: onErr, fetchProgress });
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
