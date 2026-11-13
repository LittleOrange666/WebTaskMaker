<script>
  import { onMount, untrack } from 'svelte';
  import CodeEditor from './components/CodeEditor.svelte';
  import FileTree from './components/FileTree.svelte';
  import RunPanel from './components/RunPanel.svelte';
  import Docs from './components/Docs.svelte';
  import QuickRun from './components/QuickRun.svelte';
  import Dialogs from './components/Dialogs.svelte';
  import { EXAMPLES, exampleById } from './examples/index.js';
  import {
    PLAN_FORMATS, projectToZip, projectFromZip, testdataToZip, downloadBlob, emptyProject,
  } from './lib/project.js';
  import { loadProject, replaceAll, writeChanges, fileRecord, metaRecord, requestPersist } from './lib/projectStore.js';
  import { Runner, langOf, LANG_LABELS } from './lib/runner.js';
  import { IS_MOBILE } from './lib/env.js';
  import { generate, testExtras, fileOfRole } from './lib/pipeline.js';
  import { alertDialog, confirmDialog, dialogState } from './lib/dialog.svelte.js';

  // 專案由 IndexedDB 非同步載入（spec §10.1），載入完成前為 null
  let project = $state(null);
  let loadError = $state(null);
  let selectedId = $state(null);
  let route = $state(location.hash);
  let showExamples = $state(false);

  let genState = $state.raw(null);
  let extraState = $state.raw(null);
  let running = $state(null);
  let envStatus = $state({ status: 'idle', detail: null });
  let notice = $state(null);
  let saveError = $state(null);
  let dirty = $state(false);
  // 專案每次修改時遞增，用來判斷測資是否過時
  let projectVersion = $state(0);
  let genVersion = $state(null);

  let stopped = false;
  const runner = new Runner({
    onStatus: (status, detail) => {
      // 狀態種類改變時重新計時（同一種狀態只更新進度，不重新計時）
      const since = status === envStatus.status ? envStatus.since : Date.now();
      envStatus = { status, detail, since };
    },
  });

  // 每秒更新一次，用來顯示已經過的時間（手機上編譯可能要數分鐘）
  let now = $state(Date.now());
  onMount(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  // 執行環境的狀態訊息（Python / C++ 編譯器載入、C++ 編譯中）
  let envMessage = $derived.by(() => {
    const { status, detail, since } = envStatus;
    const secs = since ? Math.floor((now - since) / 1000) : 0;
    const elapsed = secs >= 3 ? `（已 ${secs} 秒）` : '';
    if (status === 'loading-python') return `正在載入 Python 執行環境（首次約需數秒到數十秒）…${elapsed}`;
    if (status === 'loading-cpp') return `正在下載 C++ 編譯器（約 18 MB，只需下載一次）… ${detail ?? 0}%`;
    if (status === 'preparing-cpp') return `下載完成，正在準備 C++ 編譯器…${elapsed}`;
    if (status === 'compiling-cpp') return `正在編譯 C++${detail ? `：${detail}` : ''}…${elapsed}`;
    return '';
  });

  // 手機上的 C++ 提醒（spec §14.4）
  const isMobile = IS_MOBILE;
  let files = $derived(project?.files ?? []);
  let hasCpp = $derived(files.some((f) => langOf(f.name) === 'cpp'));

  let selected = $derived(files.find((f) => f.id === selectedId) ?? null);
  let editorLang = $derived(
    !selected ? null
      : selected.role === 'plan' ? (project.planFormat === 'py' || project.planFormat === 'js' ? project.planFormat : null)
      : langOf(selected.name),
  );
  let checker = $derived(project ? fileOfRole(project, 'checker') : null);
  let hasExtras = $derived(files.some((f) => f.role === 'extra'));
  let stale = $derived(genVersion !== null && genVersion !== projectVersion);

  // ---------- 自動儲存（spec §10.1）----------
  // saved：最後一次成功寫入的內容，用來找出哪些檔案需要寫入
  let saved = new Map();
  let savedMeta = '';
  let lastStructure = '';
  let skipNextChange = false;
  let saveTimer = null;
  let flushing = Promise.resolve();
  let storageOk = true;

  const metaKey = (p) => JSON.stringify(metaRecord(p));
  const structureKey = (p) => metaKey(p) + p.files.map((f) => `${f.role}\u0000${f.name}\u0000${f.expected ?? ''}`).join('\n');

  function markSaved(p) {
    saved = new Map(p.files.map((f) => [f.id, fileRecord(f)]));
    savedMeta = metaKey(p);
  }

  function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    flushing = flushing.then(doFlush);
    return flushing;
  }

  async function doFlush() {
    if (!project || !storageOk) return;
    const put = [];
    const ids = new Set();
    for (const f of project.files) {
      ids.add(f.id);
      const s = saved.get(f.id);
      if (!s || s.content !== f.content || s.name !== f.name || s.role !== f.role || s.expected !== f.expected) put.push(fileRecord(f));
    }
    const del = [...saved.keys()].filter((id) => !ids.has(id));
    const m = metaKey(project);
    const meta = m !== savedMeta ? metaRecord(project) : null;
    if (!put.length && !del.length && !meta) return;
    try {
      await writeChanges({ meta, put, del });
      for (const r of put) saved.set(r.id, r);
      for (const id of del) saved.delete(id);
      if (meta) savedMeta = m;
      saveError = null;
    } catch (e) {
      saveError = `無法自動儲存專案（${e?.message ?? e}）。請下載專案 zip 備份，以免遺失修改。`;
    }
  }

  // 偵測修改：新增、刪除、重新命名與設定變更立即寫入；內容修改在停止輸入 0.4 秒後寫入
  $effect(() => {
    if (!project) return;
    const structure = structureKey(project);
    for (const f of project.files) void f.content;
    untrack(() => {
      const structural = structure !== lastStructure;
      lastStructure = structure;
      if (skipNextChange) { skipNextChange = false; return; }
      projectVersion++;
      dirty = true;
      if (structural) flush();
      else {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, 400);
      }
    });
  });

  function setProject(p) {
    skipNextChange = true;
    project = p;
    selectedId = p.files[0]?.id ?? null;
    genState = null;
    extraState = null;
    genVersion = null;
    dirty = false;
  }

  onMount(() => {
    (async () => {
      try {
        const res = await loadProject();
        if (res) {
          markSaved(res.project);
          setProject(res.project);
        } else {
          const p = exampleById('aplusb-py').build();
          setProject(p);
          showExamples = true;
          await replaceAll(p);
          markSaved(p);
        }
      } catch (e) {
        // 無法使用 IndexedDB（例如瀏覽器限制）：仍可使用，但不會自動儲存
        storageOk = false;
        loadError = `無法讀取或儲存專案（${e?.message ?? e}）。這次的修改不會自動儲存，請記得下載專案 zip 備份。`;
        setProject(exampleById('aplusb-py').build());
        showExamples = true;
      }
      requestPersist();
    })();

    const onHash = () => (route = location.hash);
    // 離開網頁或切到背景時盡量寫入尚未儲存的修改（手機上 visibilitychange 比 beforeunload 可靠）
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    const onUnload = () => { flush(); };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
    };
  });

  async function replaceProject(p) {
    clearTimeout(saveTimer);
    await flushing;
    setProject(p);
    if (!storageOk) return;
    try {
      await replaceAll(p);
      markSaved(p);
      saveError = null;
    } catch (e) {
      saveError = `無法自動儲存專案（${e?.message ?? e}）。請下載專案 zip 備份，以免遺失修改。`;
    }
  }

  async function confirmDiscard(action) {
    if (!dirty) return true;
    return confirmDialog({
      title: `${action}？`,
      message: '目前的專案會被取代，而且有修改尚未下載備份。若需要保留，請先按「下載專案」。',
      confirmLabel: action,
      danger: true,
    });
  }

  async function loadExample(id) {
    if (!(await confirmDiscard('載入範例'))) return;
    await replaceProject(exampleById(id).build());
    showExamples = false;
    location.hash = '';
  }

  async function newProject() {
    if (!(await confirmDiscard('建立新專案'))) return;
    await replaceProject(emptyProject());
  }

  function setPlanFormat(fmt) {
    project.planFormat = fmt;
    const plan = fileOfRole(project, 'plan');
    if (plan) plan.name = PLAN_FORMATS[fmt].file;
  }

  // 節流：每個動畫影格最多更新一次畫面
  function throttled(apply) {
    let pending = null;
    let scheduled = false;
    return (state) => {
      pending = state;
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        apply(pending);
      });
    };
  }

  const copyGen = (s) => ({ ...s, tests: s.tests.map((t) => ({ ...t })) });
  const copyExtra = (s) => ({ ...s, rows: s.rows.map((r) => ({ ...r, cells: [...r.cells] })) });

  async function onGenerate() {
    if (running) return;
    running = 'generate';
    stopped = false;
    extraState = null;
    genState = null;
    genVersion = null;
    const snap = $state.snapshot(project);
    const version = projectVersion;
    try {
      const final = await generate(snap, runner, {
        onUpdate: throttled((s) => (genState = copyGen(s))),
        isStopped: () => stopped,
      });
      genState = copyGen(final);
      genVersion = version;
    } catch (e) {
      genState = { plan: null, tests: [], ok: false, done: true, error: `內部錯誤：${e.message}` };
    } finally {
      running = null;
    }
  }

  async function onTestExtras() {
    if (running || !genState?.ok) return;
    running = 'extras';
    stopped = false;
    const snap = $state.snapshot(project);
    try {
      const final = await testExtras(snap, runner, genState, {
        onUpdate: throttled((s) => (extraState = copyExtra(s))),
        isStopped: () => stopped,
      });
      extraState = copyExtra(final);
    } catch (e) {
      extraState = { rows: [], error: `內部錯誤：${e.message}` };
    } finally {
      running = null;
    }
  }

  function onStop() {
    stopped = true;
    runner.stop();
  }

  async function onDownloadTests() {
    if (!genState?.ok) return;
    downloadBlob(await testdataToZip(genState), 'testdata.zip');
  }

  function onDownloadChecker() {
    if (!checker) return;
    const ext = langOf(checker.name) ?? 'txt';
    downloadBlob(new Blob([checker.content], { type: 'text/plain' }), `checker.${ext}`);
    if (ext === 'cpp' && /#\s*include\s*[<"]testlib\.h[>"]/.test(checker.content)) {
      notice = '這個 checker 使用 testlib.h。網頁內建的是修改過的版本（為了在瀏覽器中編譯），在評測端請搭配原版 testlib.h 使用。';
    }
  }

  async function onDownloadProject() {
    downloadBlob(await projectToZip($state.snapshot(project)), 'project.zip');
    dirty = false;
  }

  let projectInput;
  async function onUploadProject(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let p;
    try {
      p = await projectFromZip(file);
    } catch (err) {
      await alertDialog({ title: '無法載入專案', message: err.message });
      return;
    }
    if (!(await confirmDiscard('上傳專案'))) return;
    await replaceProject(p);
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && showExamples && !dialogState.current) showExamples = false;
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  <header class="top">
    <a class="brand" href="#/">WebTaskMaker <small>出題工具</small></a>
    <nav class="nav">
      <a href="#/" class:active={route !== '#/docs' && route !== '#/run'}>工作區</a>
      <a href="#/run" class:active={route === '#/run'}>簡單測試</a>
      <a href="#/docs" class:active={route === '#/docs'}>使用說明</a>
    </nav>
    <span class="spacer"></span>
    <div class="menu">
      <button onclick={() => (showExamples = true)} disabled={!project}>範例</button>
      <button onclick={newProject} disabled={!project}>新專案</button>
      <button onclick={() => projectInput.click()} disabled={!project}>⤒ 上傳專案</button>
      <button onclick={onDownloadProject} disabled={!project}>⤓ 下載專案</button>
      <input type="file" accept=".zip" class="hidden" bind:this={projectInput} onchange={onUploadProject} />
    </div>
  </header>

  {#if loadError}
    <div class="banner">{loadError}</div>
  {:else if saveError}
    <div class="banner">{saveError}</div>
  {/if}
  {#if notice}
    <div class="banner">{notice} <button class="link" onclick={() => (notice = null)}>關閉</button></div>
  {/if}
  {#if isMobile && hasCpp && route !== '#/docs'}
    <div class="banner">C++ 是實驗性功能：編譯時需要數百 MB 記憶體，在手機上可能會失敗，建議使用桌面瀏覽器。</div>
  {/if}

  {#if route === '#/docs'}
    <Docs />
  {:else if !project}
    <p class="loading" role="status">載入專案中…</p>
  {:else if route === '#/run'}
    <QuickRun
      {runner} {project} {genState} {envMessage}
      busy={running !== null && running !== 'quickrun'}
      onBusy={(b) => (running = b ? 'quickrun' : null)}
    />
  {:else}
    <div class="settings">
      <label>
        模式
        <select bind:value={project.mode} disabled={!!running}>
          <option value="infer">生成輸入後求輸出</option>
          <option value="direct">直接生成輸入輸出</option>
        </select>
      </label>
      <label>
        參數表格式
        <select value={project.planFormat} onchange={(e) => setPlanFormat(e.currentTarget.value)} disabled={!!running}>
          {#each Object.entries(PLAN_FORMATS) as [k, v]}<option value={k}>{v.label}</option>{/each}
        </select>
      </label>
      <label>
        逾時（秒）
        <input type="number" min="1" max="600" bind:value={project.timeoutSec} disabled={!!running} />
      </label>
    </div>

    <main class="work">
      <aside class="side">
        <FileTree {project} bind:selectedId mode={project.mode} />
      </aside>
      <section class="editor-pane">
        {#if selected}
          <div class="editor-head">
            <span class="mono">{selected.role === 'plan' ? `參數表（${PLAN_FORMATS[project.planFormat].label}）` : selected.name}</span>
            {#if editorLang}<span class="badge">{LANG_LABELS[editorLang]}</span>{/if}
          </div>
          <div class="editor-body">
            <CodeEditor
              value={selected.content}
              lang={editorLang}
              docKey={selected.id}
              onchange={(v) => { if (selected) selected.content = v; }}
            />
          </div>
        {:else}
          <p class="placeholder">選擇左側的檔案開始編輯</p>
        {/if}
      </section>
      <section class="run-pane">
        <RunPanel
          {genState} {extraState} {running} {envMessage} {stale} {hasExtras}
          hasChecker={!!checker}
          {onGenerate} {onTestExtras} {onStop} {onDownloadTests} {onDownloadChecker}
        />
      </section>
    </main>
  {/if}

  {#if showExamples}
    <div class="overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) showExamples = false; }}>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="ex-title">
        <div class="dialog-head">
          <h2 id="ex-title">範例專案</h2>
          <button class="close" onclick={() => (showExamples = false)} aria-label="關閉">×</button>
        </div>
        <p class="muted">載入範例會取代目前的專案。第一次使用？建議從 A+B 開始，按「產生測資」看看結果，再閱讀<a href="#/docs" onclick={() => (showExamples = false)}>使用說明</a>。</p>
        <ul class="examples">
          {#each EXAMPLES as ex}
            <li>
              <button onclick={() => loadExample(ex.id)}>
                <strong>{ex.title}</strong>
                <span>{ex.description}</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}

  <Dialogs />
</div>

<style>
  .app { display: flex; flex-direction: column; height: 100vh; height: 100dvh; }
  .hidden { display: none; }
  .top {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    flex-wrap: wrap;
  }
  .brand { font-weight: 700; font-size: 16px; color: var(--text); text-decoration: none; }
  .brand small { font-weight: 400; color: var(--muted); font-size: 13px; }
  .nav { display: flex; gap: 4px; }
  .nav a { padding: 4px 10px; border-radius: 6px; color: var(--muted); text-decoration: none; font-size: 14px; }
  .nav a.active { color: var(--text); background: var(--hover); }
  .spacer { flex: 1; }
  .menu { display: flex; gap: 6px; flex-wrap: wrap; }
  .banner .link { border: none; background: none; color: var(--accent); padding: 0 4px; text-decoration: underline; }
  .banner { background: var(--warning-soft); color: var(--text); padding: 6px 16px; font-size: 13px; border-bottom: 1px solid var(--border); }
  .loading { color: var(--muted); padding: 24px; margin: 0; }
  .settings {
    display: flex;
    gap: 16px;
    padding: 6px 16px;
    font-size: 13px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    flex-wrap: wrap;
  }
  .settings label { display: flex; align-items: center; gap: 6px; color: var(--muted); }
  .settings input { width: 64px; }
  .work {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr) minmax(0, 1fr);
  }
  .side { border-right: 1px solid var(--border); background: var(--surface-2); min-height: 0; }
  .editor-pane { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--border); }
  .editor-head { display: flex; align-items: center; gap: 8px; padding: 6px 12px; font-size: 13px; border-bottom: 1px solid var(--border); }
  .badge { font-size: 11px; padding: 1px 6px; border-radius: 10px; background: var(--hover); color: var(--muted); }
  .editor-body { flex: 1; min-height: 0; }
  .run-pane { min-height: 0; min-width: 0; }
  .side, .editor-pane { min-width: 0; }
  .placeholder { color: var(--muted); padding: 24px; }
  .mono { font-family: var(--mono); }
  @media (max-width: 1000px) {
    .app { height: auto; min-height: 100vh; }
    /* minmax(0, 1fr) 防止長程式行或寬表格把欄位撐得比螢幕還寬 */
    .work { grid-template-columns: minmax(0, 1fr); }
    .side { border-right: none; border-bottom: 1px solid var(--border); max-height: 300px; }
    .editor-pane { height: 60vh; border-right: none; border-bottom: 1px solid var(--border); }
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 10;
  }
  .dialog {
    background: var(--surface);
    border-radius: 12px;
    max-width: 560px;
    width: 100%;
    max-height: 90vh;
    overflow: auto;
    padding: 16px 20px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }
  .dialog-head { display: flex; justify-content: space-between; align-items: center; }
  .dialog h2 { margin: 0; font-size: 18px; }
  .close { border: none; background: none; font-size: 20px; }
  .muted { color: var(--muted); font-size: 13px; }
  .examples { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .examples button {
    width: 100%;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
  }
  .examples span { color: var(--muted); font-size: 13px; }
</style>
