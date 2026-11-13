import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTps } from '../src/lib/tps.js';
import { renderFreemarker } from '../src/lib/freemarker.js';
import { executeJs } from '../src/runtime/jsExec.js';
import { generate, testExtras } from '../src/lib/pipeline.js';
import { defaultCheck } from '../src/runtime/genlib.js';

test('TPS: subtasks, include, seed', () => {
  const p = parseTps(`# comment
@subtask samples
manual s1.in
@subtask small
@include samples
gen 10 20
gen 10 20 seed=5
@subtask full
@include small
gen 1000
`);
  assert.equal(p.tests.length, 4);
  assert.deepEqual(p.subtasks.map((s) => [s.name, s.tests]), [
    ['samples', [1]], ['small', [1, 2, 3]], ['full', [1, 2, 3, 4]],
  ]);
  assert.deepEqual(p.tests[0].subtasks, ['samples', 'small', 'full']);
  assert.equal(p.tests[2].seed, 5);
  assert.deepEqual(p.tests[1].args, ['10', '20']);
  assert.notEqual(p.tests[1].seed, p.tests[3].seed);
});

test('TPS: errors', () => {
  assert.throws(() => parseTps('@subtask a\n@include b'), /第 2 行.*找不到子任務 b/);
  assert.throws(() => parseTps('@subtask a\n@include b\n@subtask b\n@include a'), /循環/);
  assert.throws(() => parseTps('@foo'), /未知的指令/);
});

test('FreeMarker subset', () => {
  const out = renderFreemarker(`<#-- c -->
<#assign n = 3>
<#list 1..n as i>
gen ${'${i * 10}'} <#if i % 2 == 0>even<#elseif i gt 2>big<#else>odd</#if>
</#list>
<#list [5, 7] as x>g ${'${x + 1}'} ${'${(x / 2)?int}'}
</#list>`);
  const lines = out.split('\n').map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(lines, ['gen 10 odd', 'gen 20 even', 'gen 30 big', 'g 6 2', 'g 8 3']);
  assert.throws(() => renderFreemarker('<#list 1..3 as i>'), /沒有對應/);
  assert.throws(() => renderFreemarker('${y}'), /未定義的變數 y/);
});

test('JS exec: generator determinism, out, argv', () => {
  const code = `const n = Number(argv[0]); print(n, rand_array(5, 1, 100)); out.print('ans'); print(Math.random() < 1);`;
  const a = executeJs({ role: 'generator', code, argv: ['3'], seed: 42 });
  const b = executeJs({ role: 'generator', code, argv: ['3'], seed: 42 });
  const c = executeJs({ role: 'generator', code, argv: ['3'], seed: 43 });
  assert.equal(a.status, 'ok');
  assert.equal(a.stdout, b.stdout);
  assert.notEqual(a.stdout, c.stdout);
  assert.match(a.stdout, /^3 \d+ \d+ \d+ \d+ \d+\ntrue\n$/);
  assert.equal(a.out2, 'ans\n');
});

test('JS exec: user can shadow builtins with let', () => {
  const r = executeJs({ role: 'solution', code: 'let out = []; const tokens = readAll().split(" "); print(tokens.length)', stdin: 'a b c' });
  assert.equal(r.status, 'ok', r.message);
  assert.equal(r.stdout, '3\n');
});

test('JS exec: validator strict reads', () => {
  const code = 'const n = read_int(1, 10); read_eoln(); read_ints(n, 0, 5); read_eoln(); read_eof();';
  assert.equal(executeJs({ role: 'validator', code, stdin: '3\n1 2 3\n' }).status, 'ok');
  const bad = executeJs({ role: 'validator', code, stdin: '3\n1  2 3\n' });
  assert.equal(bad.status, 'error');
  assert.match(bad.message, /第 2 行第 3 字/);
  const range = executeJs({ role: 'validator', code, stdin: '11\n' });
  assert.match(range.message, /超出範圍/);
});

test('JS exec: checker verdicts and errors', () => {
  const ck = (code) => executeJs({ role: 'checker', code, extra: { input: '1', output: '2', answer: '2' } });
  assert.equal(ck('if (output_data.trim() !== answer_data.trim()) wrong("x");').verdict, 'AC');
  assert.equal(ck('wrong("bad")').verdict, 'WA');
  assert.equal(ck('throw new Error("boom")').status, 'error');
  const sol = executeJs({ role: 'solution', code: 'exit(1)' });
  assert.equal(sol.status, 'error');
});

test('JS exec: plan script', () => {
  const r = executeJs({ role: 'plan', code: 'subtask("a"); for (const n of [1,2]) test("g", n, 5); test("g", 9, {seed: 3}); manual("x.in"); include("b")' });
  assert.equal(r.stdout, '@subtask a\ng 1 5\ng 2 5\ng 9 seed=3\nmanual x.in\n@include b\n');
});

test('JS exec: graph helpers', () => {
  const r = executeJs({
    role: 'generator', seed: 1,
    code: `const e = rand_graph(6, 10, {connected: true}); const s = new Set(e.map(([u,v]) => Math.min(u,v)+','+Math.max(u,v)));
      ensure(e.length === 10 && s.size === 10, 'graph'); ensure(rand_tree(10, 'caterpillar').length === 9);
      ensure(new Set(distinct_array(1000, 1, 1000)).size === 1000); ensure(rand_partition(10, 4).reduce((a,b)=>a+b) === 10);
      print('ok')`,
  });
  assert.equal(r.status, 'ok', r.message);
});

test('default checker', () => {
  assert.equal(defaultCheck('1 2\n3  \n\n', '1 2 3').verdict, 'AC');
  assert.equal(defaultCheck('1 2', '1 3').verdict, 'WA');
});

// 以 executeJs 模擬 Runner
const fakeRunner = {
  async run(lang, req, timeoutMs) {
    assert.equal(lang, 'js');
    if (req.code.includes('while(true)')) return { status: 'tle', message: 'x', time: timeoutMs };
    return executeJs(req);
  },
};

function project(files, extra = {}) {
  return { version: 1, mode: 'infer', planFormat: 'tps', timeoutSec: 1, files, ...extra };
}

test('pipeline: infer mode with validator and extras', async () => {
  const p = project([
    { role: 'plan', name: 'plan', content: '@subtask s\nmanual a.in\ngen 3\n@subtask big\n@include s\ngen 50' },
    { role: 'generator', name: 'gen.js', content: 'const n=+argv[0]; print(n); print(rand_array(n,1,9));' },
    { role: 'manual', name: 'a.in', content: '2\n4 5\n' },
    { role: 'solution', name: 'sol.js', content: 'readline(); print(readline().split(" ").map(Number).reduce((a,b)=>a+b));' },
    { role: 'validator', name: 'val.js', content: 'const n=read_int(1, argv[0]==="s"?10:100); read_eoln(); read_ints(n,1,9); read_eoln(); read_eof();' },
    { role: 'extra', name: 'wa.js', expected: 'WA', content: 'print(0)' },
    { role: 'extra', name: 'tle.js', expected: 'TLE', content: 'while(true){}' },
  ]);
  const st = await generate(p, fakeRunner);
  assert.equal(st.ok, true, JSON.stringify(st.tests.map((t) => t.message)));
  assert.equal(st.tests[0].output, '9\n');
  const ex = await testExtras(p, fakeRunner, st);
  assert.equal(ex.rows[0].matches, true);
  assert.equal(ex.rows[1].matches, true);
  assert.equal(ex.rows[1].summary, 'TLE');
});

test('pipeline: validator failure per subtask blocks', async () => {
  const p = project([
    { role: 'plan', name: 'plan', content: '@subtask s\ngen 30' },
    { role: 'generator', name: 'gen.js', content: 'print(argv[0])' },
    { role: 'solution', name: 'sol.js', content: 'print(1)' },
    { role: 'validator', name: 'val.js', content: 'read_int(1, argv[0]==="s"?10:100); read_eoln(); read_eof();' },
  ]);
  const st = await generate(p, fakeRunner);
  assert.equal(st.ok, false);
  assert.equal(st.tests[0].stage, 'validate');
  assert.match(st.tests[0].message, /子任務 s/);
});

test('pipeline: direct mode with mismatch detection', async () => {
  const files = [
    { role: 'plan', name: 'plan', content: '<#list 1..2 as i>\ngen ${i}\n</#list>' },
    { role: 'generator', name: 'gen.js', content: 'print(argv[0]); out.print(argv[0]*2)' },
  ];
  const ok = await generate(project(files, { mode: 'direct', planFormat: 'freemarker' }), fakeRunner);
  assert.equal(ok.ok, true);
  assert.equal(ok.tests[1].output, '4\n');
  const bad = await generate(project([...files, { role: 'solution', name: 's.js', content: 'print(0)' }], { mode: 'direct', planFormat: 'freemarker' }), fakeRunner);
  assert.equal(bad.ok, false);
  assert.equal(bad.tests[0].stage, 'check');
});

test('pipeline: js plan script', async () => {
  const p = project([
    { role: 'plan', name: 'plan', content: 'for (let i = 1; i <= 3; i++) test("gen", i);' },
    { role: 'generator', name: 'gen.js', content: 'print(argv[0])' },
    { role: 'solution', name: 'sol.js', content: 'print(readline())' },
  ], { planFormat: 'js' });
  const st = await generate(p, fakeRunner);
  assert.equal(st.ok, true);
  assert.equal(st.tests.length, 3);
});
