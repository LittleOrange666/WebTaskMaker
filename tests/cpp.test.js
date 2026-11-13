import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executeCpp } from '../src/runtime/cppExec.js';
import { generatorArgv, validatorArgv } from '../src/lib/pipeline.js';
import { parseTps } from '../src/lib/tps.js';
import { langOf } from '../src/lib/runner.js';

// tests/fixtures/cpp-modes.wasm 由 cpp-modes.cpp 以網頁相同的編譯器與參數編譯而成
const wasm = new Uint8Array(fs.readFileSync(new URL('./fixtures/cpp-modes.wasm', import.meta.url)));
let n = 0;
const run = (role, argv, opts = {}) => executeCpp({ role, key: `k${n++}`, wasm, argv, filename: 'm.cpp', ...opts });

test('cpp: stdin / stdout / argv', async () => {
  const r = await run('solution', ['echo', 'x'], { stdin: '1 2\n3\n' });
  assert.equal(r.status, 'ok', r.message);
  assert.equal(r.stdout, '6 3\n');
});

test('cpp: large output is collected', async () => {
  const r = await run('generator', ['big', '200000']);
  assert.equal(r.status, 'ok');
  const lines = r.stdout.split('\n');
  assert.equal(lines.length, 200001);
  assert.equal(lines[199999], '199999');
});

test('cpp: generator writes answer.out (direct mode)', async () => {
  const r = await run('generator', ['answer', '42']);
  assert.equal(r.status, 'ok', r.message);
  assert.equal(r.stdout, 'in\n');
  assert.equal(r.out2, 'ans 42\n');
});

test('cpp: non-zero exit and abort are errors', async () => {
  const r = await run('solution', ['exit', '3']);
  assert.equal(r.status, 'error');
  assert.match(r.message, /結束碼 3.*bye/);
  const a = await run('solution', ['abort']);
  assert.equal(a.status, 'error');
});

test('cpp: deep recursion reports a hint', async () => {
  assert.equal((await run('solution', ['depth', '1000'])).stdout, '1000\n');
  const r = await run('solution', ['depth', '10000000']);
  assert.equal(r.status, 'error');
  assert.match(r.message, /遞迴太深/);
});

test('cpp: checker exit codes map to verdicts', async () => {
  const ck = (output, answer) => run('checker', [], { extra: { input: '1 2\n', output, answer } });
  const ac = await ck('3\n', '3\n');
  assert.equal(ac.verdict, 'AC');
  assert.equal(ac.message, 'ok 3');
  const wa = await ck('4\n', '3\n');
  assert.equal(wa.verdict, 'WA');
  assert.match(wa.message, /expected 3, found 4/);
  assert.equal((await ck('abc\n', '3\n')).verdict, 'PE');
});

test('cpp: module cache needs wasm on first use', async () => {
  const r = await executeCpp({ role: 'solution', key: 'never-seen', argv: [] });
  assert.equal(r.missingModule, true);
  await run('solution', ['echo'], { key: 'cached', stdin: '5' });
  const again = await executeCpp({ role: 'solution', key: 'cached', argv: ['echo'], stdin: '7' });
  assert.equal(again.stdout, '7 2\n');
});

test('cpp: argv helpers for seed= and --group', () => {
  const plan = parseTps('gen 10 1\ngen 10 1 seed=7');
  const cppGen = { name: 'gen.cpp' };
  const pyGen = { name: 'gen.py' };
  assert.deepEqual(generatorArgv(cppGen, plan.tests[0]), ['10', '1']);
  assert.deepEqual(generatorArgv(cppGen, plan.tests[1]), ['10', '1', 'seed=7']);
  assert.deepEqual(generatorArgv(pyGen, plan.tests[1]), ['10', '1']);
  assert.deepEqual(validatorArgv({ name: 'v.cpp' }, 'small'), ['--group', 'small']);
  assert.deepEqual(validatorArgv({ name: 'v.py' }, 'small'), ['small']);
  assert.deepEqual(validatorArgv({ name: 'v.cpp' }, null), []);
  assert.equal(langOf('a.cpp'), 'cpp');
  assert.equal(langOf('a.cc'), 'cpp');
});
