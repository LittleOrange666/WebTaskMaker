<script>
  import { formatSize, byteLength } from '../lib/project.js';
  import { summarizeBySubtask } from '../lib/pipeline.js';

  let {
    genState, extraState, running, envMessage, stale, hasChecker, hasExtras,
    onGenerate, onTestExtras, onStop, onDownloadTests, onDownloadChecker,
  } = $props();

  let selected = $state(null);
  let previewTab = $state('in');
  const PREVIEW_LIMIT = 64 * 1024;

  const STAGE = { gen: '生成', validate: '驗證', solve: '解答', check: '比對' };

  let tests = $derived(genState?.tests ?? []);
  let doneCount = $derived(tests.filter((t) => t.status === 'ok' || t.status === 'error').length);
  let errorCount = $derived(tests.filter((t) => t.status === 'error').length);
  let canDownload = $derived(!running && genState?.done && genState?.ok);
  let selectedTest = $derived(selected != null ? tests.find((t) => t.index === selected) : null);

  function preview(text) {
    if (text == null) return '（無）';
    if (text.length > PREVIEW_LIMIT) return text.slice(0, PREVIEW_LIMIT) + `\n…（僅顯示前 ${formatSize(PREVIEW_LIMIT)}）`;
    return text === '' ? '（空檔案）' : text;
  }

  function statusText(t) {
    switch (t.status) {
      case 'ok': return '完成';
      case 'error': return `${STAGE[t.stage] ?? ''}失敗`;
      case 'running': return '執行中…';
      default: return '等待中';
    }
  }

  function fmtTime(ms) {
    if (ms == null) return '';
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
  }
</script>

<div class="panel">
  <div class="toolbar">
    <button class="primary" onclick={onGenerate} disabled={!!running}>▶ 產生測資</button>
    <button onclick={onTestExtras} disabled={!!running || !genState?.ok || !hasExtras} title={!hasExtras ? '專案中沒有額外解答' : !genState?.ok ? '需先成功產生測資' : ''}>測試額外解答</button>
    {#if running && running !== 'quickrun'}<button class="danger" onclick={onStop}>■ 停止</button>{/if}
    <span class="spacer"></span>
    <button onclick={onDownloadTests} disabled={!canDownload} title={canDownload ? '' : '所有測資都成功產生後才能下載'}>⤓ 下載測資 zip</button>
    {#if hasChecker}<button onclick={onDownloadChecker}>⤓ 下載 checker</button>{/if}
  </div>

  <div class="status" role="status">
    {#if envMessage}
      <span class="note">{envMessage}</span>
    {/if}
    {#if genState}
      {#if genState.error}
        <span class="err">{genState.error}</span>
      {:else if tests.length}
        <span>進度 {doneCount} / {tests.length}</span>
        {#if errorCount}<span class="err">· {errorCount} 筆失敗，修正前無法下載</span>{/if}
        {#if genState.done && genState.ok}<span class="ok">· 全部完成</span>{/if}
      {/if}
      {#if stale && genState.done}<span class="warn">· 專案已修改，測資可能過時，請重新產生</span>{/if}
    {:else}
      <span class="note">按「產生測資」開始。所有程式都在你的瀏覽器中執行。</span>
    {/if}
  </div>

  {#if tests.length}
    <div class="table-wrap">
      <table class="results">
        <thead>
          <tr><th>#</th><th>來源</th><th>子任務</th><th>狀態</th><th>.in</th><th>.out</th></tr>
        </thead>
        <tbody>
          {#each tests as t (t.index)}
            <tr class:sel={selected === t.index} class={t.status} onclick={() => (selected = t.index)}>
              <td class="num">{t.index}</td>
              <td class="mono src" title="參數表第 {t.line} 行">{t.label}</td>
              <td class="subs">{t.subtasks.join(', ')}</td>
              <td class="st">{statusText(t)}</td>
              <td class="num">{t.input != null ? formatSize(byteLength(t.input)) : ''}</td>
              <td class="num">{t.output != null ? formatSize(byteLength(t.output)) : ''}</td>
            </tr>
            {#if t.status === 'error'}
              <tr class="msg" onclick={() => (selected = t.index)}><td></td><td colspan="5"><pre>{t.message}</pre></td></tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if selectedTest}
    <div class="preview">
      <div class="tabs">
        <strong>測資 {selectedTest.index}</strong>
        <button class:active={previewTab === 'in'} onclick={() => (previewTab = 'in')}>{selectedTest.index}.in</button>
        <button class:active={previewTab === 'out'} onclick={() => (previewTab = 'out')}>{selectedTest.index}.out</button>
        {#if selectedTest.log}
          <button class:active={previewTab === 'log'} onclick={() => (previewTab = 'log')}>除錯輸出</button>
        {/if}
        <span class="spacer"></span>
        <button class="close" onclick={() => (selected = null)} aria-label="關閉預覽">×</button>
      </div>
      <pre class="content">{preview(previewTab === 'in' ? selectedTest.input : previewTab === 'out' ? selectedTest.output : selectedTest.log)}</pre>
    </div>
  {/if}

  {#if extraState}
    <div class="extras">
      <h3>額外解答測試結果 {#if extraState.error}<span class="err">（{extraState.error}）</span>{/if}</h3>
      <p class="note">執行時間僅供參考：瀏覽器與 WASM 的速度和正式評測環境差異很大。</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>解答</th><th>預期</th><th>結果</th><th>符合</th>
              {#each genState?.plan?.subtasks ?? [] as st}<th>{st.name}</th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each extraState.rows as row}
              {@const subs = genState?.plan ? summarizeBySubtask(row, genState.plan) : []}
              <tr class:mismatch={row.done && !row.matches}>
                <td class="mono">{row.name}</td>
                <td>{row.expected === 'any' ? '任意' : row.expected}</td>
                <td>{row.done ? row.summary : '…'}</td>
                <td>{row.done ? (row.matches ? '✓' : '✗ 不符') : ''}</td>
                {#each subs as s}
                  <td><span class="v v-{s.verdict}">{s.verdict}</span> <small>{fmtTime(s.time)}</small></td>
                {/each}
              </tr>
              <tr class="cells-row">
                <td colspan={4 + subs.length}>
                  <div class="cells">
                    {#each row.cells as c, i}
                      <span class="cell v-{c?.verdict ?? 'none'}" title="測資 {i + 1}：{c ? `${c.verdict} ${fmtTime(c.time)} ${c.message ?? ''}` : '尚未執行'}">{i + 1}</span>
                    {/each}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: auto;
    padding: 10px 12px;
    box-sizing: border-box;
    gap: 8px;
  }
  .toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .spacer { flex: 1; }
  .status { font-size: 13px; display: flex; flex-wrap: wrap; gap: 4px; min-height: 18px; }
  .note { color: var(--muted); font-size: 13px; margin: 0; }
  .err { color: var(--danger); }
  .ok { color: var(--success); }
  .warn { color: var(--warning); }
  .table-wrap { overflow: auto; border: 1px solid var(--border); border-radius: 8px; flex-shrink: 0; max-height: 45vh; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { padding: 4px 8px; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; }
  th { position: sticky; top: 0; background: var(--surface-2); font-weight: 600; z-index: 1; }
  .results tbody tr { cursor: pointer; }
  .results tbody tr:hover { background: var(--hover); }
  tr.sel { background: var(--accent-soft) !important; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: var(--mono); }
  .src { max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
  .subs { color: var(--muted); max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
  tr.ok .st { color: var(--success); }
  tr.error .st { color: var(--danger); font-weight: 600; }
  tr.running .st { color: var(--accent); }
  tr.pending .st { color: var(--muted); }
  tr.msg td { border-bottom: 1px solid var(--border); padding-top: 0; }
  tr.msg pre {
    margin: 0;
    white-space: pre-wrap;
    color: var(--danger);
    font-family: var(--mono);
    font-size: 12px;
    max-height: 160px;
    overflow: auto;
  }
  .preview { border: 1px solid var(--border); border-radius: 8px; display: flex; flex-direction: column; flex-shrink: 0; }
  .tabs { display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-bottom: 1px solid var(--border); background: var(--surface-2); border-radius: 8px 8px 0 0; font-size: 13px; }
  .tabs strong { margin-right: 6px; }
  .tabs button { font-size: 12px; padding: 2px 8px; font-family: var(--mono); }
  .tabs button.active { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  .tabs .close { border: none; background: none; font-size: 16px; }
  .content { margin: 0; padding: 8px; max-height: 300px; overflow: auto; font-family: var(--mono); font-size: 12px; white-space: pre; }
  .extras h3 { font-size: 14px; margin: 8px 0 2px; }
  tr.mismatch td:first-child, tr.mismatch td:nth-child(4) { color: var(--danger); font-weight: 600; }
  .cells-row td { white-space: normal; }
  .cells { display: flex; flex-wrap: wrap; gap: 2px; }
  .cell {
    display: inline-block;
    min-width: 20px;
    text-align: center;
    font-size: 10px;
    padding: 1px 2px;
    border-radius: 3px;
    background: var(--surface-2);
    color: var(--muted);
  }
  .v { font-weight: 600; font-size: 12px; }
  .v-AC { color: var(--success); }
  .v-WA, .v-PE, .v-FAIL { color: var(--danger); }
  .v-TLE { color: var(--warning); }
  .v-RE { color: var(--purple); }
  .cell.v-AC { background: var(--success); color: white; }
  .cell.v-WA, .cell.v-PE, .cell.v-FAIL { background: var(--danger); color: white; }
  .cell.v-TLE { background: var(--warning); color: white; }
  .cell.v-RE { background: var(--purple); color: white; }
</style>
