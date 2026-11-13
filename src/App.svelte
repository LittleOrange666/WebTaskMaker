<script>
  import { onMount } from 'svelte';
  import CodeEditor from './components/CodeEditor.svelte';
  import FileTree from './components/FileTree.svelte';
  import RunPanel from './components/RunPanel.svelte';
  import Docs from './components/Docs.svelte';
  import QuickRun from './components/QuickRun.svelte';
  import { EXAMPLES, exampleById } from './examples/index.js';
  import {
    PLAN_FORMATS, loadFromStorage, saveToStorage, projectToZip, projectFromZip,
    testdataToZip, downloadBlob, emptyProject,
  } from './lib/project.js';
  import { Runner, langOf, LANG_LABELS } from './lib/runner.js';
  import { generate, testExtras, fileOfRole } from './lib/pipeline.js';

  const restored = loadFromStorage();
  const initial = restored ?? exampleById('aplusb-py').build();
  let project = $state(initial);
  let selectedId = $state(initial.files[0]?.id);
  let route = $state(location.hash);
  let showExamples = $state(!restored);

  let genState = $state.raw(null);
  let extraState = $state.raw(null);
  let running = $state(null);
  let envStatus = $state({ status: 'idle', detail: null });
  let notice = $state(null);
  let saveError = $state(null);
  let dirty = $state(false);
  let currentJson = $state('');
  let genJson = $state(null);

  let stopped = false;
  const runner = new Runner({ onStatus: (status, detail) => (envStatus = { status, detail }) });

  // 執行環境的狀態訊息（Python / C++ 編譯器載入、C++ 編譯中）
  let envMessage = $derived.by(() => {
    const { status, detail } = envStatus;
    if (status === 'loading-python') return '正在載入 Python 執行環境（首次約需數秒到數十秒）…';
    if (status === 'loading-cpp') return `正在下載 C++ 編譯器（約 18 MB，只需下載一次）… ${detail ?? 0}%`;
    if (status === 'compiling-cpp') return `正在編譯 C++${typeof detail === 'string' ? `：${detail}` : ''}…`;
    return '';
  });

  // 手機上的 C++ 提醒（spec §14.4）
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  let hasCpp = $derived(project.files.some((f) => langOf(f.name) === 'cpp'));

  let selected = $derived(project.files.find((f) => f.id === selectedId) ?? null);
  let editorLang = $derived(
    !selected ? null
      : selected.role === 'plan' ? (project.planFormat === 'py' || project.planFormat === 'js' ? project.planFormat : null)
      : langOf(selected.name),
  );
  let checker = $derived(fileOfRole(project, 'checker'));
  let hasExtras = $derived(project.files.some((f) => f.role === 'extra'));
  let stale = $derived(genJson !== null && genJson !== currentJson);

  // 自動儲存到 localStorage（spec §10）
  let saveTimer;
  let firstSave = true;
  $effect(() => {
    const json = JSON.stringify(project);
    currentJson = json;
    if (firstSave) { firstSave = false; return; }
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveError = saveToStorage($state.snapshot(project)); }, 400);
  });

  onMount(() => {
    const onHash = () => (route = location.hash);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    const onUnload = () => saveToStorage($state.snapshot(project));
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
      window.removeEventListener('beforeunload', onUnload);
    };
  });

  function replaceProject(p) {
    project = p;
    selectedId = p.files[0]?.id;
    genState = null;
    extraState = null;
    genJson = null;
    dirty = false;
    firstSave = true;
    saveError = saveToStorage($state.snapshot(project));
  }

  function confirmDiscard() {
    return !dirty || confirm('目前的專案有尚未下載備份的修改，載入後會被取代。確定要繼續嗎？');
  }

  function loadExample(id) {
    if (!confirmDiscard()) return;
    replaceProject(exampleById(id).build());
    showExamples = false;
    location.hash = '';
  }

  function newProject() {
    if (!confirmDiscard()) return;
    replaceProject(emptyProject());
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
    genJson = null;
    const snap = $state.snapshot(project);
    const json = JSON.stringify(snap);
    try {
      const final = await generate(snap, runner, {
        onUpdate: throttled((s) => (genState = copyGen(s))),
        isStopped: () => stopped,
      });
      genState = copyGen(final);
      genJson = json;
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
    if (!file || !confirmDiscard()) return;
    try {
      replaceProject(await projectFromZip(file));
    } catch (err) {
      alert(`無法載入專案：${err.message}`);
    }
  }
</script>

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
      <button onclick={() => (showExamples = true)}>範例</button>
      <button onclick={newProject}>新專案</button>
      <button onclick={() => projectInput.click()}>⤒ 上傳專案</button>
      <button onclick={onDownloadProject}>⤓ 下載專案</button>
      <input type="file" accept=".zip" class="hidden" bind:this={projectInput} onchange={onUploadProject} />
    </div>
  </header>

  {#if saveError}
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
    grid-template-columns: 230px minmax(0, 1fr) minmax(0, 1fr);
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
    .side { border-right: none; border-bottom: 1px solid var(--border); max-height: 260px; }
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
