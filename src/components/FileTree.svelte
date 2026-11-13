<script>
  import { ROLES, EXPECTED, PLAN_FORMATS, makeFile } from '../lib/project.js';
  import { langOf } from '../lib/runner.js';

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

  let uploadRole = $state(null);
  let uploadInput;

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

  function addFile(role) {
    const name = prompt(`新增${ROLES[role].label}，請輸入檔名：`, DEFAULT_NAMES[role]);
    if (name == null) return;
    const err = validateName(role, name.trim());
    if (err) { alert(err); return; }
    const file = makeFile(role, name.trim(), '', role === 'extra' ? { expected: 'AC' } : {});
    project.files.push(file);
    selectedId = file.id;
  }

  function renameFile(file) {
    const name = prompt('新的檔名：', file.name);
    if (name == null || name.trim() === file.name) return;
    const err = validateName(file.role, name.trim(), file.id);
    if (err) { alert(err); return; }
    file.name = name.trim();
  }

  function deleteFile(file) {
    if (!confirm(`確定要刪除 ${file.name}？`)) return;
    const idx = project.files.findIndex((f) => f.id === file.id);
    project.files.splice(idx, 1);
    if (selectedId === file.id) selectedId = project.files[0]?.id;
  }

  function startUpload(role) {
    uploadRole = role;
    uploadInput.value = '';
    uploadInput.multiple = !ROLES[role].single;
    uploadInput.click();
  }

  async function onUpload(e) {
    const role = uploadRole;
    const files = [...e.target.files];
    for (const file of files) {
      const content = await file.text();
      const existing = project.files.find((f) => f.role === role && (ROLES[role].single || f.name === file.name));
      if (existing && role !== 'plan') {
        if (!confirm(`要以上傳的 ${file.name} 取代 ${existing.name}？`)) continue;
      }
      if (existing) {
        existing.content = content;
        if (role !== 'plan') existing.name = file.name;
        selectedId = existing.id;
        continue;
      }
      const err = validateName(role, file.name);
      if (err) { alert(`${file.name}：${err}`); continue; }
      const f = makeFile(role, file.name, content, role === 'extra' ? { expected: 'AC' } : {});
      project.files.push(f);
      selectedId = f.id;
    }
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
          <button class="icon" title="上傳檔案" onclick={() => startUpload(role)}>⤒</button>
          {#if canAdd && role !== 'plan'}
            <button class="icon" title="新增檔案" onclick={() => addFile(role)}>＋</button>
          {/if}
        </span>
      </header>
      {#if files.length === 0}
        <p class="empty">{role === 'solution' || role === 'generator' ? '尚未新增' : '—'}</p>
      {/if}
      {#each files as file (file.id)}
        <div class="file" class:selected={file.id === selectedId}>
          <button class="name" onclick={() => (selectedId = file.id)} title={file.name}>
            {role === 'plan' ? PLAN_FORMATS[project.planFormat].label : file.name}
          </button>
          {#if role === 'extra'}
            <select bind:value={file.expected} title="預期結果" aria-label="預期結果">
              {#each EXPECTED as v}<option value={v}>{v === 'any' ? '任意' : v}</option>{/each}
            </select>
          {/if}
          {#if role !== 'plan'}
            <button class="icon small" title="重新命名" onclick={() => renameFile(file)}>✎</button>
            <button class="icon small" title="刪除" onclick={() => deleteFile(file)}>×</button>
          {/if}
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
    text-transform: none;
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
    padding: 4px 8px;
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
  select {
    font-size: 11px;
    padding: 1px 2px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .icon {
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 14px;
    padding: 0 4px;
    border-radius: 4px;
    line-height: 1.4;
  }
  .icon:hover { color: var(--text); background: var(--hover); }
  .icon.small { font-size: 12px; opacity: 0; }
  .file:hover .icon.small, .file.selected .icon.small { opacity: 1; }
  @media (hover: none) { .icon.small { opacity: 1; } }
</style>
