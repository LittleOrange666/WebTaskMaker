// 在目前執行緒中執行使用者的 JavaScript 程式（由 js.worker.js 呼叫，也可在 Node 測試中直接使用）
import { makeRng } from './rng.js';
import {
  createRandomLib, Reader, ensure, accept, wrong, tokens, float_equal,
  CheckerResult, ValidationError,
} from './genlib.js';

class ExitSignal {
  constructor(code) { this.code = code; }
}

function fmtValue(x) {
  if (typeof x === 'string') return x;
  if (Array.isArray(x)) return x.map(fmtValue).join(' ');
  return String(x);
}

/**
 * req: { role, code, argv, stdin, seed, extra, filename }
 * role: generator | solution | validator | checker | plan
 * 回傳 { status: 'ok' | 'error', stdout, out2, stderr, verdict?, message?, time }
 */
export function executeJs(req) {
  const t0 = performance.now();
  const role = req.role;
  const stdin = req.stdin ?? '';
  const rng = makeRng(req.seed ?? 0);
  const outBuf = [];
  const out2Buf = [];
  const errBuf = [];

  const print = (...a) => { outBuf.push(a.map(fmtValue).join(' ') + '\n'); };
  const write = (...a) => { outBuf.push(a.map(fmtValue).join('')); };
  const out = {
    print: (...a) => { out2Buf.push(a.map(fmtValue).join(' ') + '\n'); },
    write: (...a) => { out2Buf.push(a.map(fmtValue).join('')); },
  };

  let pos = 0;
  const readline = () => {
    if (pos >= stdin.length) return null;
    let idx = stdin.indexOf('\n', pos);
    if (idx < 0) idx = stdin.length;
    let line = stdin.slice(pos, idx);
    pos = idx + 1;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    return line;
  };
  const readAll = () => {
    const rest = pos >= stdin.length ? '' : stdin.slice(pos);
    pos = stdin.length;
    return rest;
  };

  const logTo = (...a) => { errBuf.push(a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ') + '\n'); };
  const fakeConsole = { log: logTo, error: logTo, warn: logTo, info: logTo, debug: logTo };
  const fakeMath = Object.create(Math);
  fakeMath.random = rng.random;

  const lib = createRandomLib(rng.random);
  const reader = new Reader(stdin);
  const io = {
    print_array: (arr, sep = ' ') => print(arr.map(fmtValue).join(sep)),
    print_edges: (edges) => { for (const e of edges) print(e.map(fmtValue).join(' ')); },
    print_matrix: (mat) => { for (const row of mat) print(row.map(fmtValue).join(' ')); },
  };
  const readers = {
    read_int: (lo, hi) => reader.read_int(lo, hi),
    read_ints: (n, lo, hi) => reader.read_ints(n, lo, hi),
    read_token: () => reader.read_token(),
    read_line: () => reader.read_line(),
    read_space: () => reader.read_space(),
    read_eoln: () => reader.read_eoln(),
    read_eof: () => reader.read_eof(),
  };
  const gen = { ...lib, ...io, ...readers, ensure, accept, wrong, tokens, float_equal };

  const env = {
    argv: (req.argv ?? []).map(String),
    print, write, out, readline, readAll,
    console: fakeConsole, Math: fakeMath,
    exit: (code = 0) => { throw new ExitSignal(code); },
    gen, ...gen,
  };

  if (role === 'checker') {
    env.input_data = req.extra?.input ?? '';
    env.output_data = req.extra?.output ?? '';
    env.answer_data = req.extra?.answer ?? '';
  }
  const planLines = [];
  if (role === 'plan') {
    env.subtask = (name) => planLines.push(`@subtask ${name}`);
    env.include = (...names) => planLines.push(`@include ${names.join(' ')}`);
    env.manual = (file) => planLines.push(`manual ${file}`);
    env.test = (genName, ...args) => {
      let seed;
      if (args.length && typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null && !Array.isArray(args[args.length - 1])) {
        seed = args.pop().seed;
      }
      const parts = [genName, ...args.map(fmtValue)];
      if (seed !== undefined) parts.push(`seed=${seed}`);
      planLines.push(parts.join(' '));
    };
  }

  const res = { status: 'ok' };
  try {
    const names = Object.keys(env);
    // eslint-disable-next-line no-new-func
    // 包一層內部函式，讓使用者可以用 let/const 宣告與內建名稱同名的變數
    const fn = new Function(...names, `return (function () {\n${req.code}\n})();\n//# sourceURL=${req.filename ?? 'main.js'}`);
    fn(...names.map((k) => env[k]));
    if (role === 'checker') res.verdict = 'AC';
  } catch (e) {
    if (e instanceof ExitSignal) {
      if (e.code !== 0) { res.status = 'error'; res.message = `程式以結束碼 ${e.code} 結束`; }
      else if (role === 'checker') res.verdict = 'AC';
    } else if (e instanceof CheckerResult && role === 'checker') {
      res.verdict = e.verdict;
      res.message = e.msg;
    } else if (e instanceof ValidationError) {
      res.status = 'error';
      res.message = e.message;
    } else {
      res.status = 'error';
      res.message = formatError(e, req.filename ?? 'main.js');
    }
  }
  res.stdout = role === 'plan' ? planLines.join('\n') + '\n' : outBuf.join('');
  res.out2 = out2Buf.join('');
  res.stderr = errBuf.join('');
  res.time = performance.now() - t0;
  return res;
}

function formatError(e, filename) {
  if (!(e instanceof Error)) return `拋出例外：${String(e)}`;
  const head = `${e.name}: ${e.message}`;
  const stack = String(e.stack || '')
    .split('\n')
    .filter((l) => l.includes(filename))
    .map((l) => l.trim())
    .slice(0, 5);
  return stack.length ? `${head}\n${stack.join('\n')}` : head;
}
