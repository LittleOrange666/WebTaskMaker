// 專案資料結構、localStorage 與 zip 匯入匯出（spec §4、§10、§11）
import JSZip from 'jszip';
import { STORAGE_KEY } from './config.js';

export const ROLES = {
  plan: { label: '參數表', dir: 'plan', single: true },
  generator: { label: '生成器', dir: 'generators' },
  solution: { label: '標準解答', dir: 'solution', single: true },
  manual: { label: '手生測資', dir: 'manual' },
  validator: { label: '格式驗證器', dir: 'validator', single: true },
  checker: { label: 'checker', dir: 'checker', single: true },
  extra: { label: '額外解答', dir: 'extras' },
};

export const PLAN_FORMATS = {
  tps: { label: 'TPS 格式', file: 'gen_data.txt' },
  freemarker: { label: 'FreeMarker 子集', file: 'script.ftl' },
  py: { label: 'Python 腳本', file: 'plan.py' },
  js: { label: 'JavaScript 腳本', file: 'plan.js' },
};

export const EXPECTED = ['AC', 'WA', 'TLE', 'RE', 'any'];

let idCounter = 0;
export function newId() {
  idCounter++;
  return `f${Date.now().toString(36)}${idCounter}`;
}

export function makeFile(role, name, content = '', extra = {}) {
  return { id: newId(), role, name, content, ...extra };
}

export function emptyProject() {
  return {
    version: 1,
    mode: 'infer',
    planFormat: 'tps',
    timeoutSec: 10,
    files: [makeFile('plan', PLAN_FORMATS.tps.file, '')],
  };
}

/** 檢查並補齊專案欄位，避免讀到損壞或舊版資料 */
export function normalizeProject(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.files)) throw new Error('專案格式錯誤');
  const proj = {
    version: 1,
    mode: p.mode === 'direct' ? 'direct' : 'infer',
    planFormat: PLAN_FORMATS[p.planFormat] ? p.planFormat : 'tps',
    timeoutSec: Number(p.timeoutSec) > 0 ? Number(p.timeoutSec) : 10,
    files: p.files
      .filter((f) => f && ROLES[f.role] && typeof f.name === 'string')
      .map((f) => {
        const file = { id: f.id || newId(), role: f.role, name: f.name, content: String(f.content ?? '') };
        if (f.role === 'extra') file.expected = EXPECTED.includes(f.expected) ? f.expected : 'AC';
        return file;
      }),
  };
  if (!proj.files.some((f) => f.role === 'plan')) proj.files.unshift(makeFile('plan', PLAN_FORMATS[proj.planFormat].file, ''));
  return proj;
}

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeProject(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** 回傳 null 表示成功，否則回傳錯誤訊息 */
export function saveToStorage(project) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    return null;
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
      return '專案太大，超出瀏覽器 localStorage 容量，無法自動儲存。請下載專案 zip 備份。';
    }
    return `無法自動儲存：${e?.message ?? e}`;
  }
}

export async function projectToZip(project) {
  const zip = new JSZip();
  const meta = {
    version: 1,
    mode: project.mode,
    planFormat: project.planFormat,
    timeoutSec: project.timeoutSec,
    files: [],
  };
  const used = new Set();
  for (const f of project.files) {
    let path = `${ROLES[f.role].dir}/${f.name}`;
    let k = 2;
    while (used.has(path)) path = `${ROLES[f.role].dir}/${k++}_${f.name}`;
    used.add(path);
    zip.file(path, f.content);
    const entry = { role: f.role, name: f.name, path };
    if (f.role === 'extra') entry.expected = f.expected;
    meta.files.push(entry);
  }
  zip.file('project.json', JSON.stringify(meta, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function projectFromZip(blob) {
  const zip = await JSZip.loadAsync(blob);
  const metaFile = zip.file('project.json');
  if (!metaFile) throw new Error('zip 中找不到 project.json，這不是 WebTaskMaker 專案檔');
  const meta = JSON.parse(await metaFile.async('string'));
  if (!Array.isArray(meta.files)) throw new Error('project.json 格式錯誤');
  const files = [];
  for (const entry of meta.files) {
    const zf = zip.file(entry.path);
    if (!zf) throw new Error(`zip 中缺少檔案 ${entry.path}`);
    files.push({ ...entry, content: await zf.async('string') });
  }
  return normalizeProject({ ...meta, files });
}

export async function testdataToZip(genState) {
  const zip = new JSZip();
  for (const t of genState.tests) {
    zip.file(`${t.index}.in`, t.input);
    zip.file(`${t.index}.out`, t.output);
  }
  const subtasks = {};
  for (const st of genState.plan.subtasks) subtasks[st.name] = st.tests;
  zip.file('subtasks.json', JSON.stringify(subtasks, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatSize(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function byteLength(s) {
  return s == null ? 0 : new TextEncoder().encode(s).length;
}
