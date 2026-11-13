<script>
  // 簡單測試（spec §15）：給定程式碼與輸入，執行並取得輸出
  import CodeEditor from './CodeEditor.svelte';
  import { langOf, LANG_LABELS } from '../lib/runner.js';
  import { QUICKRUN_STORAGE_KEY } from '../lib/config.js';
  import { ROLES, formatSize, byteLength, downloadBlob } from '../lib/project.js';

  let { runner, project, genState, envMessage, busy, onBusy } = $props();

  const DEFAULT_CODE = {
    cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    long long a, b;
    cin >> a >> b;
    cout << a + b << "\\n";
}
`,
    py: `a, b = map(int, input().split())
print(a + b)
`,
    js: `const [a, b] = readline().split(' ').map(Number);
print(a + b);
`,
  };
  const FILENAMES = { cpp: 'main.cpp', py: 'main.py', js: 'main.js' };
  const PREVIEW_LIMIT = 64 * 1024;

  function loadState() {
    try {
      const raw = localStorage.getItem(QUICKRUN_STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && LANG_LABELS[s.lang] && s.codes) {
          return { lang: s.lang, codes: { ...DEFAULT_CODE, ...s.codes }, args: String(s.args ?? ''), stdin: String(s.stdin ?? '') };
        }
      }
    } catch { /* 忽略損壞或無法讀取的資料 */ }
    return { lang: 'cpp', codes: { ...DEFAULT_CODE }, args: '', stdin: '1 2\n' };
  }

  let qs = $state(loadState());
  let result = $state.raw(null);
  let running = $state(false);
  let editorKey = $state(1);
  let tab = $state('stdout');
  let copied = $state(false);

  // 自動儲存（與專案分開，spec §15.3）
  let saveTimer;
  $effect(() => {
    const json = JSON.stringify(qs);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(QUICKRUN_STORAGE_KEY, json); } catch { /* 容量不足時略過 */ }
    }, 400);
  });

  let programFiles = $derived(project.files.filter((f) => f.role !== 'plan' && f.role !== 'manual' && langOf(f.name)));
  let inputSources = $derived([
    ...project.files.filter((f) => f.role === 'manual').map((f) => ({ id: `m:${f.id}`, label: `手生測資：${f.name}`, content: f.content })),
    ...(genState?.tests ?? []).filter((t) => t.input != null).map((t) => ({ id: `t:${t.index}`, label: `已產生的測資：${t.index}.in`, content: t.input })),
  ]);

  function setLang(l) {
    qs.lang = l;
    editorKey++;
  }

  function loadProgram(e) {
    const f = project.files.find((x) => x.id === e.currentTarget.value);
    e.currentTarget.value = '';
    if (!f) return;
    const l = langOf(f.name);
    qs.codes[l] = f.content;
    qs.lang = l;
    editorKey++;
  }

  function loadInput(e) {
    const src = inputSources.find((x) => x.id === e.currentTarget.value);
    e.currentTarget.value = '';
    if (src) qs.stdin = src.content;
  }

  let inputFile;
  async function uploadInput(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) qs.stdin = await file.text();
  }

  function splitArgs(s) {
    return s.trim() ? s.trim().split(/\s+/) : [];
  }

  async function run() {
    if (running || busy) return;
    running = true;
    onBusy(true);
    result = null;
    const lang = qs.lang;
    try {
      const res = await runner.run(lang, {
        role: 'solution',
        code: qs.codes[lang],
        filename: FILENAMES[lang],
        argv: splitArgs(qs.args),
        stdin: qs.stdin,
        seed: 0,
      }, (project.timeoutSec || 10) * 1000);
      result = { ...res, lang };
      tab = res.status === 'ok' || res.stdout ? 'stdout' : 'message';
    } catch (e) {
      result = { status: 'error', message: `內部錯誤：${e.message}`, stdout: '', stderr: '', lang };
      tab = 'message';
    } finally {
      running = false;
      onBusy(false);
    }
  }

  function stop() {
    runner.stop();
  }

  function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  }

  function preview(text) {
    if (!text) return '（無）';
    return text.length > PREVIEW_LIMIT ? text.slice(0, PREVIEW_LIMIT) + `\n…（僅顯示前 ${formatSize(PREVIEW_LIMIT)}）` : text;
  }

  async function copyOut() {
    try {
      await navigator.clipboard.writeText(result.stdout);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      alert('無法複製到剪貼簿');
    }
  }

  function downloadOut() {
    downloadBlob(new Blob([result.stdout], { type: 'text/plain' }), 'output.txt');
  }

  function statusLabel(r) {
    if (r.status === 'ok') return { text: '正常結束', cls: 'ok' };
    if (r.status === 'tle') return { text: '逾時', cls: 'warn' };
    if (r.status === 'stopped') return { text: '已停止', cls: 'muted' };
    if (r.compileError) return { text: '編譯錯誤', cls: 'err' };
    return { text: '執行錯誤', cls: 'err' };
  }

  function fmtTime(ms) {
    if (ms == null) return '';
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="quick">
  <section class="code">
    <div class="bar">
      <div class="langs" role="group" aria-label="語言">
        {#each Object.entries(LANG_LABELS) as [l, label]}
          <button class:active={qs.lang === l} onclick={() => setLang(l)} aria-pressed={qs.lang === l}>{label}</button>
        {/each}
      </div>
      <span class="spacer"></span>
      {#if programFiles.length}
        <select onchange={loadProgram} aria-label="從專案載入程式">
          <option value="">從專案載入程式…</option>
          {#each programFiles as f}<option value={f.id}>{ROLES[f.role].label}：{f.name}</option>{/each}
        </select>
      {/if}
    </div>
    {#if qs.lang === 'cpp'}
      <p class="hint">C++ 為實驗性功能：不能使用例外（try / throw），遞迴深度約 5,000 層，<code>long</code> 為 32 位元。第一次執行需下載約 18 MB 的編譯器。</p>
    {/if}
    <div class="editor">
      <CodeEditor
        value={qs.codes[qs.lang]}
        lang={qs.lang}
        docKey={'quick-' + editorKey}
        onchange={(v) => (qs.codes[qs.lang] = v)}
      />
    </div>
  </section>

  <section class="io">
    <label class="field">
      <span>命令列參數（可選，以空白分隔）</span>
      <input type="text" bind:value={qs.args} placeholder="例如：10 1 100" spellcheck="false" />
    </label>

    <div class="field">
      <div class="field-head">
        <span>輸入（stdin）</span>
        <span class="spacer"></span>
        {#if inputSources.length}
          <select onchange={loadInput} aria-label="從專案載入輸入">
            <option value="">從專案載入輸入…</option>
            {#each inputSources as src}<option value={src.id}>{src.label}</option>{/each}
          </select>
        {/if}
        <button class="small" onclick={() => inputFile.click()}>⤒ 上傳檔案</button>
        <input type="file" class="hidden" bind:this={inputFile} onchange={uploadInput} />
      </div>
      <textarea bind:value={qs.stdin} spellcheck="false" rows="8" aria-label="輸入"></textarea>
      <small class="muted">{formatSize(byteLength(qs.stdin))}</small>
    </div>

    <div class="actions">
      <button class="primary" onclick={run} disabled={running || busy} title="Ctrl + Enter">▶ 執行</button>
      {#if running}<button class="danger" onclick={stop}>■ 停止</button>{/if}
      {#if busy}<span class="muted">工作區正在產生測資，請等待完成或先停止。</span>{/if}
      {#if running && envMessage}<span class="muted">{envMessage}</span>{:else if running}<span class="muted">執行中…</span>{/if}
    </div>

    {#if result}
      {@const st = statusLabel(result)}
      <div class="result">
        <div class="result-head">
          <strong class={st.cls}>{st.text}</strong>
          {#if result.time != null && result.status !== 'stopped'}<span class="muted">{fmtTime(result.time)}（僅供參考）</span>{/if}
          <span class="spacer"></span>
          <div class="tabs" role="tablist">
            <button role="tab" class:active={tab === 'stdout'} aria-selected={tab === 'stdout'} onclick={() => (tab = 'stdout')}>輸出 {result.stdout ? `(${formatSize(byteLength(result.stdout))})` : ''}</button>
            <button role="tab" class:active={tab === 'stderr'} aria-selected={tab === 'stderr'} onclick={() => (tab = 'stderr')}>stderr</button>
            {#if result.message}
              <button role="tab" class:active={tab === 'message'} aria-selected={tab === 'message'} onclick={() => (tab = 'message')}>訊息</button>
            {/if}
          </div>
        </div>
        {#if tab === 'stdout'}
          {#if result.stdout}
            <div class="out-actions">
              <button class="small" onclick={copyOut}>{copied ? '已複製' : '複製'}</button>
              <button class="small" onclick={downloadOut}>⤓ 下載</button>
            </div>
          {/if}
          <pre>{preview(result.stdout)}</pre>
        {:else if tab === 'stderr'}
          <pre>{preview(result.stderr)}</pre>
        {:else}
          <pre class="msg">{result.message}</pre>
        {/if}
      </div>
    {/if}
  </section>
</div>

<style>
  .quick {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .code { display: flex; flex-direction: column; min-height: 0; min-width: 0; border-right: 1px solid var(--border); }
  .bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .langs { display: flex; gap: 0; }
  .langs button { border-radius: 0; margin-left: -1px; }
  .langs button:first-child { border-radius: 6px 0 0 6px; margin-left: 0; }
  .langs button:last-child { border-radius: 0 6px 6px 0; }
  .langs button.active { background: var(--accent); border-color: var(--accent); color: var(--on-accent); position: relative; }
  .spacer { flex: 1; }
  .hint { margin: 0; padding: 6px 12px; font-size: 12px; color: var(--muted); background: var(--surface-2); border-bottom: 1px solid var(--border); }
  .hint code { font-family: var(--mono); }
  .editor { flex: 1; min-height: 0; }
  .io { display: flex; flex-direction: column; gap: 12px; padding: 12px; overflow: auto; min-width: 0; }
  .field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  .field > span, .field-head > span:first-child { color: var(--muted); }
  .field-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .field input[type='text'], textarea { font-family: var(--mono); font-size: 13px; }
  textarea {
    resize: vertical;
    min-height: 100px;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    white-space: pre;
  }
  .hidden { display: none; }
  .small { font-size: 12px; padding: 2px 8px; }
  .actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }
  .muted { color: var(--muted); font-size: 13px; }
  .result { border: 1px solid var(--border); border-radius: 8px; display: flex; flex-direction: column; min-width: 0; }
  .result-head { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border); background: var(--surface-2); border-radius: 8px 8px 0 0; flex-wrap: wrap; font-size: 13px; }
  .ok { color: var(--success); }
  .err { color: var(--danger); }
  .warn { color: var(--warning); }
  .tabs { display: flex; gap: 4px; }
  .tabs button { font-size: 12px; padding: 2px 8px; }
  .tabs button.active { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  .out-actions { display: flex; gap: 6px; padding: 6px 10px 0; }
  pre { margin: 0; padding: 8px 10px; max-height: 50vh; overflow: auto; font-family: var(--mono); font-size: 12px; white-space: pre; }
  pre.msg { white-space: pre-wrap; color: var(--danger); }
  @media (max-width: 1000px) {
    .quick { grid-template-columns: minmax(0, 1fr); }
    .code { border-right: none; border-bottom: 1px solid var(--border); }
    .editor { height: 50vh; flex: none; }
  }
</style>
