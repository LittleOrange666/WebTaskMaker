// 類 TPS gen/data 參數表解析（spec §6.1）
import { hashSeed, parseSeed } from '../runtime/rng.js';

export class PlanError extends Error {
  constructor(message, line) {
    super(line ? `參數表第 ${line} 行：${message}` : message);
    this.line = line;
  }
}

/**
 * 回傳 { tests, subtasks }
 * tests[i] = { index, kind: 'gen' | 'manual', gen, args, seed, file, line, text, subtasks: [] }
 * subtasks[j] = { name, tests: [index...] }
 */
export function parseTps(text) {
  const tests = [];
  const subtaskDefs = []; // { name, own: [], includes: [{ name, line }], line }
  const byName = new Map();
  let current = null;

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!line) return;
    const tokens = line.split(/\s+/);
    const head = tokens[0];

    if (head === '@subtask') {
      if (tokens.length !== 2) throw new PlanError('@subtask 後面需要剛好一個名稱', lineNo);
      const name = tokens[1];
      if (byName.has(name)) throw new PlanError(`子任務 ${name} 重複定義`, lineNo);
      current = { name, own: [], includes: [], line: lineNo };
      byName.set(name, current);
      subtaskDefs.push(current);
      return;
    }
    if (head === '@include') {
      if (!current) throw new PlanError('@include 必須寫在 @subtask 之後', lineNo);
      if (tokens.length < 2) throw new PlanError('@include 後面需要子任務名稱', lineNo);
      for (const name of tokens.slice(1)) current.includes.push({ name, line: lineNo });
      return;
    }
    if (head.startsWith('@')) throw new PlanError(`未知的指令 ${head}`, lineNo);

    const index = tests.length + 1;
    if (head === 'manual') {
      if (tokens.length !== 2) throw new PlanError('manual 後面需要剛好一個檔名', lineNo);
      tests.push({ index, kind: 'manual', file: tokens[1], line: lineNo, text: line, subtasks: [] });
    } else {
      const args = [];
      let seed;
      let seedArg;
      for (const t of tokens.slice(1)) {
        const m = /^seed=(.+)$/.exec(t);
        if (m) { seed = parseSeed(m[1]); seedArg = m[1]; }
        else args.push(t);
      }
      if (seed === undefined) seed = hashSeed([head, ...args].join(' '));
      // seedArg：明確指定的 seed= 原始值（C++ 生成器會以 seed=<值> 附加為最後一個參數，spec §14.3）
      tests.push({ index, kind: 'gen', gen: head, args, seed, seedArg, line: lineNo, text: line, subtasks: [] });
    }
    if (current) current.own.push(index);
  });

  // 展開 @include（可遞迴），偵測循環
  const resolved = new Map();
  const visiting = new Set();
  const resolve = (def) => {
    if (resolved.has(def.name)) return resolved.get(def.name);
    if (visiting.has(def.name)) throw new PlanError(`子任務 ${def.name} 的 @include 形成循環`, def.line);
    visiting.add(def.name);
    const set = new Set(def.own);
    for (const inc of def.includes) {
      const other = byName.get(inc.name);
      if (!other) throw new PlanError(`找不到子任務 ${inc.name}`, inc.line);
      if (other === def) throw new PlanError(`子任務 ${def.name} 不能 include 自己`, inc.line);
      for (const x of resolve(other)) set.add(x);
    }
    visiting.delete(def.name);
    const arr = [...set].sort((a, b) => a - b);
    resolved.set(def.name, arr);
    return arr;
  };

  const subtasks = subtaskDefs.map((def) => ({ name: def.name, tests: resolve(def) }));
  for (const st of subtasks) {
    for (const idx of st.tests) tests[idx - 1].subtasks.push(st.name);
  }
  return { tests, subtasks };
}
