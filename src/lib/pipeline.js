// 產生測資與測試解答的流程（spec §1、§2、§7）
import { parseTps, PlanError } from './tps.js';
import { renderFreemarker } from './freemarker.js';
import { defaultCheck } from '../runtime/genlib.js';
import { langOf } from './runner.js';

export const VERDICT_ORDER = ['AC', 'WA', 'PE', 'RE', 'TLE'];

function baseName(name) {
  return name.replace(/\.[^.]+$/, '');
}

export function filesByRole(project, role) {
  return project.files.filter((f) => f.role === role);
}

export function fileOfRole(project, role) {
  return project.files.find((f) => f.role === role) ?? null;
}

function stoppedError() {
  const e = new Error('已停止');
  e.stopped = true;
  return e;
}

async function runFile(runner, file, req, timeoutMs) {
  const lang = langOf(file.name);
  if (!lang) return { status: 'error', message: `無法從檔名 ${file.name} 判斷語言（需為 .py 或 .js）`, stdout: '', out2: '', stderr: '' };
  return runner.run(lang, { ...req, code: file.content, filename: file.name }, timeoutMs);
}

function describeFailure(res) {
  if (res.status === 'tle') return `逾時（${res.message ?? ''}）`;
  if (res.status === 'stopped') return '已停止';
  return res.message || '執行失敗';
}

/** 把參數表轉成測資清單 */
export async function buildPlan(project, runner) {
  const plan = fileOfRole(project, 'plan');
  if (!plan) throw new PlanError('專案中沒有參數表');
  const timeoutMs = project.timeoutSec * 1000;
  switch (project.planFormat) {
    case 'tps':
      return parseTps(plan.content);
    case 'freemarker':
      return parseTps(renderFreemarker(plan.content));
    case 'py':
    case 'js': {
      const res = await runner.run(project.planFormat, { role: 'plan', code: plan.content, filename: `plan.${project.planFormat}`, argv: [], stdin: '' }, timeoutMs);
      if (res.status === 'stopped') throw stoppedError();
      if (res.status !== 'ok') throw new PlanError(`參數表腳本執行失敗：${describeFailure(res)}`);
      return parseTps(res.stdout);
    }
    default:
      throw new PlanError(`未知的參數表格式 ${project.planFormat}`);
  }
}

/** 用 checker（或內建 checker）判定 output 是否正確 */
export async function checkOutput(project, runner, input, output, answer) {
  const checker = fileOfRole(project, 'checker');
  if (!checker) return defaultCheck(output, answer);
  const res = await runFile(runner, checker, { role: 'checker', argv: [], stdin: '', extra: { input, output, answer } }, project.timeoutSec * 1000);
  if (res.status === 'stopped') throw stoppedError();
  if (res.status !== 'ok') return { verdict: 'FAIL', message: `checker 執行失敗：${describeFailure(res)}` };
  return { verdict: res.verdict ?? 'AC', message: res.message ?? '' };
}

/**
 * 產生測資。onUpdate(state) 會在每個步驟後被呼叫。
 * 回傳 state = { plan, tests: [...], ok: boolean, error?: string }
 * tests[i] = { index, label, subtasks, status: pending|running|ok|error, stage, message, input, output, log }
 */
export async function generate(project, runner, { onUpdate = () => {}, isStopped = () => false } = {}) {
  const state = { plan: null, tests: [], ok: false, error: null, done: false };
  const emit = () => onUpdate(state);
  const timeoutMs = project.timeoutSec * 1000;

  try {
    state.plan = await buildPlan(project, runner);
  } catch (e) {
    state.error = e.stopped ? '已停止' : e.message;
    state.done = true;
    emit();
    return state;
  }
  if (!state.plan.tests.length) {
    state.error = '參數表沒有任何測資';
    state.done = true;
    emit();
    return state;
  }

  const generators = new Map(filesByRole(project, 'generator').map((f) => [baseName(f.name), f]));
  const manuals = new Map(filesByRole(project, 'manual').map((f) => [f.name, f]));
  const validator = fileOfRole(project, 'validator');
  const solution = fileOfRole(project, 'solution');
  const direct = project.mode === 'direct';

  state.tests = state.plan.tests.map((t) => ({
    index: t.index,
    label: t.text,
    line: t.line,
    subtasks: t.subtasks,
    status: 'pending',
    stage: null,
    message: '',
    input: null,
    output: null,
    log: '',
  }));
  emit();

  const fail = (r, stage, message) => {
    r.status = 'error';
    r.stage = stage;
    r.message = message;
  };

  try {
    for (let i = 0; i < state.plan.tests.length; i++) {
      if (isStopped()) throw stoppedError();
      const t = state.plan.tests[i];
      const r = state.tests[i];
      r.status = 'running';
      emit();

      // 1. 輸入
      let expected = null;
      if (t.kind === 'manual') {
        const m = manuals.get(t.file);
        if (!m) { fail(r, 'gen', `找不到手生測資 ${t.file}`); emit(); continue; }
        r.input = m.content;
        const outFile = manuals.get(baseName(t.file) + '.out');
        if (outFile) expected = outFile.content;
      } else {
        const g = generators.get(t.gen);
        if (!g) { fail(r, 'gen', `找不到生成器 ${t.gen}（請確認檔名為 ${t.gen}.py 或 ${t.gen}.js）`); emit(); continue; }
        const res = await runFile(runner, g, { role: 'generator', argv: t.args, seed: t.seed, stdin: '' }, timeoutMs);
        if (res.status === 'stopped') throw stoppedError();
        r.log += res.stderr ?? '';
        if (res.status !== 'ok') { fail(r, 'gen', `生成器錯誤：${describeFailure(res)}`); emit(); continue; }
        r.input = res.stdout;
        if (direct) expected = res.out2;
      }

      // 2. 驗證
      if (validator) {
        const sts = t.subtasks.length ? t.subtasks : [null];
        let bad = null;
        for (const st of sts) {
          const res = await runFile(runner, validator, { role: 'validator', argv: st ? [st] : [], stdin: r.input }, timeoutMs);
          if (res.status === 'stopped') throw stoppedError();
          if (res.status !== 'ok') { bad = `驗證失敗${st ? `（子任務 ${st}）` : ''}：${describeFailure(res)}`; break; }
        }
        if (bad) { fail(r, 'validate', bad); emit(); continue; }
      }

      // 3. 輸出
      if (solution) {
        const res = await runFile(runner, solution, { role: 'solution', argv: [], stdin: r.input }, timeoutMs);
        if (res.status === 'stopped') throw stoppedError();
        r.log += res.stderr ?? '';
        if (res.status !== 'ok') { fail(r, 'solve', `標準解答錯誤：${describeFailure(res)}`); emit(); continue; }
        if (expected !== null) {
          const c = await checkOutput(project, runner, r.input, res.stdout, expected);
          if (c.verdict !== 'AC') { fail(r, 'check', `標準解答輸出與預期輸出不符：${c.message}`); emit(); continue; }
          r.output = expected;
        } else {
          r.output = res.stdout;
        }
      } else if (expected !== null) {
        r.output = expected;
      } else {
        fail(r, 'solve', direct ? '生成器沒有寫入輸出（out.print），也沒有標準解答' : '沒有標準解答，無法產生輸出');
        emit();
        continue;
      }

      r.status = 'ok';
      emit();
    }
  } catch (e) {
    if (!e.stopped) throw e;
    state.error = '已停止';
    for (const r of state.tests) if (r.status === 'running' || r.status === 'pending') r.status = 'pending';
  }

  state.ok = !state.error && state.tests.every((r) => r.status === 'ok');
  state.done = true;
  emit();
  return state;
}

/**
 * 測試額外解答（spec §7.4）。genState 為 generate() 成功的結果。
 * 回傳 rows[j] = { name, expected, cells: [{ verdict, time, message }], verdicts: Set, matches, done }
 */
export async function testExtras(project, runner, genState, { onUpdate = () => {}, isStopped = () => false } = {}) {
  const extras = filesByRole(project, 'extra');
  const timeoutMs = project.timeoutSec * 1000;
  const rows = extras.map((f) => ({ name: f.name, expected: f.expected ?? 'AC', cells: genState.tests.map(() => null), summary: null, matches: null, done: false }));
  const result = { rows, error: null };
  const emit = () => onUpdate(result);
  emit();

  try {
    for (let j = 0; j < extras.length; j++) {
      const f = extras[j];
      const row = rows[j];
      for (let i = 0; i < genState.tests.length; i++) {
        if (isStopped()) throw stoppedError();
        const t = genState.tests[i];
        row.cells[i] = { verdict: '…', time: null, message: '' };
        emit();
        const res = await runFile(runner, f, { role: 'solution', argv: [], stdin: t.input }, timeoutMs);
        if (res.status === 'stopped') throw stoppedError();
        let cell;
        if (res.status === 'tle') cell = { verdict: 'TLE', time: timeoutMs, message: res.message };
        else if (res.status !== 'ok') cell = { verdict: 'RE', time: res.time, message: res.message };
        else {
          const c = await checkOutput(project, runner, t.input, res.stdout, t.output);
          cell = { verdict: c.verdict, time: res.time, message: c.message };
        }
        row.cells[i] = cell;
        emit();
      }
      finishRow(row);
      emit();
    }
  } catch (e) {
    if (!e.stopped) throw e;
    result.error = '已停止';
  }
  emit();
  return result;
}

function finishRow(row) {
  const verdicts = new Set(row.cells.map((c) => c.verdict));
  const failing = [...verdicts].filter((v) => v !== 'AC');
  row.summary = failing.length ? failing.join(', ') : 'AC';
  const exp = row.expected;
  if (exp === 'any') row.matches = true;
  else if (exp === 'AC') row.matches = failing.length === 0;
  else if (exp === 'WA') row.matches = verdicts.has('WA') || verdicts.has('PE');
  else row.matches = verdicts.has(exp);
  row.done = true;
}

/** 依子任務彙總：取最差結果與最長時間 */
export function summarizeBySubtask(row, plan) {
  return plan.subtasks.map((st) => {
    let worst = 'AC';
    let maxTime = 0;
    for (const idx of st.tests) {
      const c = row.cells[idx - 1];
      if (!c || c.verdict === '…') { worst = worst === 'AC' ? '…' : worst; continue; }
      if (VERDICT_ORDER.indexOf(c.verdict) > VERDICT_ORDER.indexOf(worst) || c.verdict === 'FAIL') worst = c.verdict;
      if (c.time) maxTime = Math.max(maxTime, c.time);
    }
    return { name: st.name, verdict: worst, time: maxTime };
  });
}

export { PlanError };
