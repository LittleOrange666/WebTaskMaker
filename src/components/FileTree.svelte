<script>
  import { ROLES, EXPECTED, PLAN_FORMATS, makeFile, downloadBlob } from '../lib/project.js';
  import { langOf } from '../lib/runner.js';
  import { alertDialog, confirmDialog, promptDialog } from '../lib/dialog.svelte.js';

  let { project, selectedId = $bindable(), mode } = $props();

  const ORDER = ['plan', 'generator', 'solution', 'manual', 'validator', 'checker', 'extra'];
  const DEFAULT_NAMES = {
    generator: 'gen_random.py',
    solution: 'sol.py',
    manual: 'sample1.in',
    validator: 'validator.py',
    checker: 'checker.py',
    extra: 'wrong.py',
  };
  const HINTS = {
    plan: '描述要產生哪些測資',
    generator: '參數表以檔名（不含副檔名）呼叫',
    solution: '產生 .out',
    manual: '可附上同名的 .out',
    validator: '檢查 .in 格式（可選）',
    checker: '未提供時使用內建 checker',
    extra: '用 checker 判定是否符合預期',
  };

  let uploadInput;
  let uploadTarget = null; // { role } 上傳新檔案；{ file } 取代某個檔案的內容

  function optional(role) {
    if (role === 'solution') return mode === 'direct';
    return role === 'manual' || role === 'validator' || role === 'checker' || role === 'extra';
  }

  function needsLang(role) {
    return role !== 'manual' && role !== 'plan';
  }

  function validateName(role, name, exceptId = null) {
    if (!name || /[\/\\]/.test(name)) return '檔名不可為空，也不可包含斜線';
    if (/\s/.test(name)) return '檔名不可包含空白';
    if (needsLang(role) && !langOf(name)) return '程式檔名需以 .py、.js 或 .cpp 結尾';
    if (project.files.some((f) => f.role === role && f.name === name && f.id !== exceptId)) return `已經有名為 ${name} 的檔案`;
    return null;
  }

  async function addFile(role) {
    const name = await promptDialog({
      title: `新增${ROLES[role].label}`,
      label: '檔名',
      value: DEFAULT_NAMES[role],
      confirmLabel: '新增',
      validate: (v) => validateName(role, v),
    });
    if (name == null) return;
    const file = makeFile(role, name, '', role === 'extra' ? { expected: 'AC' } : {});
    project.files.push(file);
    selectedId = file.id;
  }

  async function renameFile(file) {
    const name = await promptDialog({
      title: '重新命名',
      label: '新的檔名',
      value: file.name,
      confirmLabel: '重新命名',
      validate: (v) => validateName(file.role, v, file.id),
    });
    if (name == null || name === file.name) return;
    file.name = name;
  }

  async function deleteFile(file) {
    const ok = await confirmDialog({
      title: `刪除 ${file.name}？`,
      message: '刪除後無法復原。若需要保留，請先下載這個檔案或下載專案 zip。',
      confirmLabel: '刪除',
      danger: true,
    });
    if (!ok) return;
    const idx = project.files.findIndex((f) => f.id === file.id);
    if (idx >= 0) project.files.splice(idx, 1);
    if (selectedId === file.id) selectedId = project.files[0]?.id;
  }

  function downloadFile(file) {
    downloadBlob(new Blob([file.content], { type: 'text/plain' }), file.name);
  }

  function pick(target, multiple) {
    uploadTarget = target;
    uploadInput.value = '';
    uploadInput.multiple = multiple;
    uploadInput.click();
  }

  async function onUpload(e) {
    const target = uploadTarget;
    const picked = [...e.target.files];
    e.target.value = '';
    if (!target || !picked.length) return;
    if (target.file) await replaceContent(target.file, picked[0]);
    else await uploadNew(target.role, picked);
  }

  /** 以上傳的檔案取代某個檔案的內容（spec §4.1） */
  async function replaceContent(file, picked) {
    const content = await picked.text();
    // 程式的語言不同時（例如把 .cpp 上傳到 gen.py），改用上傳的檔名，否則執行時會用錯語言
    if (needsLang(file.role) && langOf(picked.name) !== langOf(file.name)) {
      const err = validateName(file.role, picked.name, file.id);
      if (err) {
        await alertDialog({ title: '無法上傳', message: `${picked.name}：${err}` });
        return;
      }
      file.name = picked.name;
    }
    file.content = content;
    selectedId = file.id;
  }

  /** 上傳新檔案到某個分類，同名（或只能有一個的分類已有檔案）時詢問是否取代 */
  async function uploadNew(role, picked) {
    const errors = [];
    for (const p of picked) {
      const content = await p.text();
      const existing = project.files.find((f) => f.role === role && (ROLES[role].single || f.name === p.name));
      if (existing) {
        const ok = await confirmDialog({
          title: '取代檔案？',
          message: role === 'plan'
            ? `要以 ${p.name} 的內容取代目前的參數表嗎？`
            : `要以上傳的 ${p.name} 取代 ${existing.name} 嗎？原本的內容會被覆蓋。`,
          confirmLabel: '取代',
          danger: true,
        });
        if (!ok) continue;
        if (role !== 'plan') {
          const err = validateName(role, p.name, existing.id);
          if (err) { errors.push(`${p.name}：${err}`); continue; }
          existing.name = p.name;
        }
        existing.content = content;
        selectedId = existing.id;
        continue;
      }
      const err = validateName(role, p.name);
      if (err) { errors.push(`${p.name}：${err}`); continue; }
      const f = makeFile(role, p.name, content, role === 'extra' ? { expected: 'AC' } : {});
      project.files.push(f);
      selectedId = f.id;
    }
    if (errors.length) await alertDialog({ title: '部分檔案無法上傳', message: errors.join('\n') });
  }
</script>

<input type="file" class="hidden" bind:this={uploadInput} onchange={onUpload} />

<nav class="tree" aria-label="專案檔案">
  {#each ORDER as role}
    {@const files = project.files.filter((f) => f.role === role)}
    {@const canAdd = !ROLES[role].single || files.length === 0}
    <section>
      <header>
        <span class="group" title={HINTS[role]}>
          {ROLES[role].label}
          {#if optional(role)}<small>可選</small>{/if}
        </span>
        <span class="actions">
          {#if role !== 'plan'}
            <button class="icon" title={ROLES[role].single ? '上傳檔案' : '上傳新檔案（可多選）'} aria-label="上傳{ROLES[role].label}" onclick={() => pick({ role }, !ROLES[role].single)}>⤒</button>
          {/if}
          {#if canAdd && role !== 'plan'}
            <button class="icon" title="新增檔案" aria-label="新增{ROLES[role].label}" onclick={() => addFile(role)}>＋</button>
          {/if}
        </span>
      </header>
      {#if files.length === 0}
        <p class="empty">{role === 'solution' || role === 'generator' ? '尚未新增' : '—'}</p>
      {/if}
      {#each files as file (file.id)}
        {@const label = role === 'plan' ? PLAN_FORMATS[project.planFormat].label : file.name}
        <div class="file" class:selected={file.id === selectedId}>
          <button class="name" onclick={() => (selectedId = file.id)} title={file.name}>{label}</button>
          {#if role === 'extra'}
            <select bind:value={file.expected} title="預期結果" aria-label="{file.name} 的預期結果">
              {#each EXPECTED as v}<option value={v}>{v === 'any' ? '任意' : v}</option>{/each}
            </select>
          {/if}
          <span class="file-actions">
            <button class="icon small" title="上傳並取代內容" aria-label="上傳並取代 {label}" onclick={() => pick({ file }, false)}>⤒</button>
            <button class="icon small" title="下載" aria-label="下載 {label}" onclick={() => downloadFile(file)}>⤓</button>
            {#if role !== 'plan'}
              <button class="icon small" title="重新命名" aria-label="重新命名 {file.name}" onclick={() => renameFile(file)}>✎</button>
              <button class="icon small" title="刪除" aria-label="刪除 {file.name}" onclick={() => deleteFile(file)}>×</button>
            {/if}
          </span>
        </div>
      {/each}
    </section>
  {/each}
</nav>

<style>
  .hidden { display: none; }
  .tree {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    overflow: auto;
    height: 100%;
    box-sizing: border-box;
  }
  section header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    margin-bottom: 2px;
  }
  .group small {
    font-weight: 400;
    margin-left: 4px;
    opacity: 0.8;
  }
  .actions { display: flex; gap: 2px; }
  .empty {
    margin: 2px 8px;
    font-size: 12px;
    color: var(--muted);
  }
  .file {
    display: flex;
    align-items: center;
    gap: 2px;
    border-radius: 6px;
  }
  .file.selected { background: var(--accent-soft); }
  .file:hover:not(.selected) { background: var(--hover); }
  .name {
    flex: 1;
    min-width: 0;
    text-align: left;
    background: none;
    border: none;
    padding: 4px 6px;
    font: inherit;
    font-size: 13px;
    font-family: var(--mono);
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  .file.selected .name { color: var(--accent); font-weight: 600; }
  .file-actions { display: flex; flex-shrink: 0; }
  select {
    font-size: 11px;
    padding: 1px 2px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    flex-shrink: 0;
  }
  .icon {
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 14px;
    padding: 0 4px;
    border-radius: 4px;
    line-height: 1.6;
  }
  .icon:hover { color: var(--text); background: var(--hover); }
  /* 按鈕一律顯示（手機上沒有滑鼠移過去的狀態，spec §4.1），未選取時顏色較淡 */
  .icon.small { font-size: 12px; padding: 0 3px; opacity: 0.55; }
  .file:hover .icon.small, .file.selected .icon.small, .icon.small:focus-visible { opacity: 1; }
  @media (hover: none) {
    .icon.small { opacity: 1; font-size: 15px; padding: 2px 6px; }
  }
</style>
