// 類 Polygon FreeMarker 子集（spec §6.2）
// 支援：<#assign>、<#list>、<#if>/<#elseif>/<#else>、${運算式}、<#-- 註解 -->
import { PlanError } from './tps.js';

const MAX_ITERATIONS = 1_000_000;

function lineAt(src, pos) {
  let n = 1;
  for (let i = 0; i < pos && i < src.length; i++) if (src[i] === '\n') n++;
  return n;
}

// 從 pos 開始找到結束字元 endCh（忽略字串與括號內的部分），回傳其索引
function scanUntil(src, pos, endCh) {
  let depth = 0;
  let quote = null;
  for (let i = pos; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === endCh && depth <= 0) return i;
  }
  return -1;
}

// ---------- 模板切分與樹狀結構 ----------

function parseTemplate(src) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  let pos = 0;
  let textStart = 0;

  const flushText = (end) => {
    if (end > textStart) top().children.push({ type: 'text', value: src.slice(textStart, end) });
  };

  while (pos < src.length) {
    if (src.startsWith('<#--', pos)) {
      flushText(pos);
      const end = src.indexOf('-->', pos + 4);
      if (end < 0) throw new PlanError('註解 <#-- 沒有對應的 -->', lineAt(src, pos));
      pos = textStart = end + 3;
    } else if (src.startsWith('${', pos)) {
      flushText(pos);
      const end = scanUntil(src, pos + 2, '}');
      if (end < 0) throw new PlanError('${ 沒有對應的 }', lineAt(src, pos));
      top().children.push({ type: 'interp', expr: src.slice(pos + 2, end), line: lineAt(src, pos) });
      pos = textStart = end + 1;
    } else if (src.startsWith('</#', pos)) {
      flushText(pos);
      const end = src.indexOf('>', pos);
      if (end < 0) throw new PlanError('結束標籤沒有 >', lineAt(src, pos));
      const name = src.slice(pos + 3, end).trim();
      const line = lineAt(src, pos);
      const node = top();
      if (node.type !== name) throw new PlanError(`</#${name}> 沒有對應的開始標籤`, line);
      stack.pop();
      pos = textStart = end + 1;
    } else if (src.startsWith('<#', pos)) {
      flushText(pos);
      const end = scanUntil(src, pos + 2, '>');
      if (end < 0) throw new PlanError('標籤沒有 >', lineAt(src, pos));
      let body = src.slice(pos + 2, end).trim();
      if (body.endsWith('/')) body = body.slice(0, -1).trim();
      const line = lineAt(src, pos);
      const m = /^(\w+)\s*([\s\S]*)$/.exec(body);
      if (!m) throw new PlanError(`無法解析標籤 <#${body}>`, line);
      const [, name, rest] = m;
      handleDirective(name, rest, line, stack);
      pos = textStart = end + 1;
    } else {
      pos++;
    }
  }
  flushText(src.length);
  if (stack.length > 1) {
    const open = top();
    throw new PlanError(`<#${open.type}> 沒有對應的 </#${open.type}>`, open.line);
  }
  return root;
}

function handleDirective(name, rest, line, stack) {
  const top = stack[stack.length - 1];
  switch (name) {
    case 'assign': {
      top.children.push({ type: 'assign', assigns: parseAssigns(rest, line), line });
      break;
    }
    case 'list': {
      const m = /^([\s\S]+)\s+as\s+([A-Za-z_]\w*)$/.exec(rest.trim());
      if (!m) throw new PlanError('<#list> 語法應為 <#list 序列 as 變數>', line);
      const node = { type: 'list', seq: parseExpr(m[1], line), var: m[2], children: [], line };
      top.children.push(node);
      stack.push(node);
      break;
    }
    case 'if': {
      const node = { type: 'if', branches: [{ cond: parseExpr(rest, line), children: [] }], line };
      node.children = node.branches[0].children;
      top.children.push(node);
      stack.push(node);
      break;
    }
    case 'elseif':
    case 'else': {
      if (top.type !== 'if') throw new PlanError(`<#${name}> 必須在 <#if> 之內`, line);
      if (top.hasElse) throw new PlanError(`<#else> 之後不能再有 <#${name}>`, line);
      const branch = { cond: name === 'else' ? null : parseExpr(rest, line), children: [] };
      if (name === 'else') top.hasElse = true;
      top.branches.push(branch);
      top.children = branch.children;
      break;
    }
    default:
      throw new PlanError(`不支援的標籤 <#${name}>`, line);
  }
}

function parseAssigns(rest, line) {
  const toks = tokenize(rest, line);
  const p = new ExprParser(toks, line);
  const assigns = [];
  while (!p.atEnd()) {
    const id = p.next();
    if (id.t !== 'id') throw new PlanError('<#assign> 需要變數名稱', line);
    const eq = p.next();
    if (!eq || eq.v !== '=') throw new PlanError('<#assign> 語法應為 <#assign 變數 = 運算式>', line);
    assigns.push({ name: id.v, expr: p.parseExpr() });
  }
  if (!assigns.length) throw new PlanError('<#assign> 需要變數名稱', line);
  return assigns;
}

// ---------- 運算式 ----------

const OPS = ['..<', '..!', '..', '==', '!=', '<=', '>=', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '!', '(', ')', '[', ']', ',', '?', '='];

function tokenize(src, line) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/\d/.test(c)) {
      let j = i;
      while (j < src.length && /\d/.test(src[j])) j++;
      if (src[j] === '.' && /\d/.test(src[j + 1] ?? '')) {
        j++;
        while (j < src.length && /\d/.test(src[j])) j++;
      }
      toks.push({ t: 'num', v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') { j++; s += { n: '\n', t: '\t' }[src[j]] ?? src[j]; } else s += src[j];
        j++;
      }
      if (j >= src.length) throw new PlanError('字串沒有結束', line);
      toks.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /\w/.test(src[j])) j++;
      const w = src.slice(i, j);
      const wordOps = { gt: '>', gte: '>=', lt: '<', lte: '<=', true: null, false: null };
      if (w === 'true' || w === 'false') toks.push({ t: 'bool', v: w === 'true' });
      else if (w in wordOps) toks.push({ t: 'op', v: wordOps[w] });
      else toks.push({ t: 'id', v: w });
      i = j;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new PlanError(`無法辨識的字元 ${JSON.stringify(c)}`, line);
    toks.push({ t: 'op', v: op });
    i += op.length;
  }
  return toks;
}

class ExprParser {
  constructor(toks, line) { this.toks = toks; this.i = 0; this.line = line; }
  atEnd() { return this.i >= this.toks.length; }
  peek() { return this.toks[this.i]; }
  next() { return this.toks[this.i++]; }
  isOp(v) { const t = this.peek(); return t && t.t === 'op' && t.v === v; }
  expect(v) {
    if (!this.isOp(v)) throw new PlanError(`運算式中預期 ${v}`, this.line);
    this.i++;
  }
  parseExpr() { return this.parseOr(); }
  parseOr() {
    let l = this.parseAnd();
    while (this.isOp('||')) { this.i++; l = { op: '||', l, r: this.parseAnd() }; }
    return l;
  }
  parseAnd() {
    let l = this.parseEq();
    while (this.isOp('&&')) { this.i++; l = { op: '&&', l, r: this.parseEq() }; }
    return l;
  }
  parseEq() {
    let l = this.parseRel();
    while (this.isOp('==') || this.isOp('!=') || this.isOp('=')) {
      let op = this.next().v;
      if (op === '=') op = '==';
      l = { op, l, r: this.parseRel() };
    }
    return l;
  }
  parseRel() {
    let l = this.parseRange();
    while (['<', '<=', '>', '>='].some((o) => this.isOp(o))) {
      const op = this.next().v;
      l = { op, l, r: this.parseRange() };
    }
    return l;
  }
  parseRange() {
    const l = this.parseAdd();
    if (this.isOp('..') || this.isOp('..<') || this.isOp('..!')) {
      const op = this.next().v;
      return { op: op === '..' ? '..' : '..<', l, r: this.parseAdd() };
    }
    return l;
  }
  parseAdd() {
    let l = this.parseMul();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.next().v;
      l = { op, l, r: this.parseMul() };
    }
    return l;
  }
  parseMul() {
    let l = this.parseUnary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = this.next().v;
      l = { op, l, r: this.parseUnary() };
    }
    return l;
  }
  parseUnary() {
    if (this.isOp('-')) { this.i++; return { op: 'neg', e: this.parseUnary() }; }
    if (this.isOp('!')) { this.i++; return { op: 'not', e: this.parseUnary() }; }
    return this.parsePostfix();
  }
  parsePostfix() {
    let e = this.parsePrimary();
    for (;;) {
      if (this.isOp('?')) {
        this.i++;
        const t = this.next();
        if (!t || t.t !== 'id') throw new PlanError('? 後面需要內建函式名稱', this.line);
        e = { op: 'builtin', name: t.v, e };
      } else if (this.isOp('[')) {
        this.i++;
        const idx = this.parseExpr();
        this.expect(']');
        e = { op: 'index', e, idx };
      } else return e;
    }
  }
  parsePrimary() {
    const t = this.next();
    if (!t) throw new PlanError('運算式不完整', this.line);
    if (t.t === 'num' || t.t === 'str' || t.t === 'bool') return { op: 'lit', v: t.v };
    if (t.t === 'id') return { op: 'var', name: t.v };
    if (t.t === 'op' && t.v === '(') {
      const e = this.parseExpr();
      this.expect(')');
      return e;
    }
    if (t.t === 'op' && t.v === '[') {
      const items = [];
      if (!this.isOp(']')) {
        items.push(this.parseExpr());
        while (this.isOp(',')) { this.i++; items.push(this.parseExpr()); }
      }
      this.expect(']');
      return { op: 'seq', items };
    }
    throw new PlanError(`運算式中出現非預期的 ${t.v}`, this.line);
  }
}

function parseExpr(src, line) {
  const p = new ExprParser(tokenize(src, line), line);
  const e = p.parseExpr();
  if (!p.atEnd()) throw new PlanError(`運算式中有多餘的 ${p.peek().v}`, line);
  return e;
}

function makeRange(a, b, inclusive, line) {
  if (!Number.isInteger(a) || !Number.isInteger(b)) throw new PlanError('範圍的兩端必須是整數', line);
  const step = a <= b ? 1 : -1;
  const count = Math.abs(b - a) + (inclusive ? 1 : 0);
  if (count > MAX_ITERATIONS) throw new PlanError(`範圍太大（超過 ${MAX_ITERATIONS} 個元素）`, line);
  return Array.from({ length: count }, (_, i) => a + i * step);
}

function evalExpr(e, env, line) {
  const ev = (x) => evalExpr(x, env, line);
  const num = (v, what) => {
    if (typeof v !== 'number') throw new PlanError(`${what} 需要數字，收到 ${JSON.stringify(v)}`, line);
    return v;
  };
  switch (e.op) {
    case 'lit': return e.v;
    case 'var': {
      if (!(e.name in env)) throw new PlanError(`未定義的變數 ${e.name}`, line);
      return env[e.name];
    }
    case 'seq': return e.items.map(ev);
    case 'neg': return -num(ev(e.e), '負號');
    case 'not': return !ev(e.e);
    case '&&': return ev(e.l) && ev(e.r);
    case '||': return ev(e.l) || ev(e.r);
    case '..': return makeRange(ev(e.l), ev(e.r), true, line);
    case '..<': return makeRange(ev(e.l), ev(e.r), false, line);
    case 'index': {
      const s = ev(e.e);
      const i = num(ev(e.idx), '索引');
      if (!Array.isArray(s) && typeof s !== 'string') throw new PlanError('只能對序列或字串取索引', line);
      if (i < 0 || i >= s.length) throw new PlanError(`索引 ${i} 超出範圍`, line);
      return s[i];
    }
    case 'builtin': {
      const v = ev(e.e);
      switch (e.name) {
        case 'c': case 'string': return String(v);
        case 'int': return Math.trunc(num(v, '?int'));
        case 'floor': return Math.floor(num(v, '?floor'));
        case 'ceiling': return Math.ceil(num(v, '?ceiling'));
        case 'round': return Math.round(num(v, '?round'));
        case 'abs': return Math.abs(num(v, '?abs'));
        case 'size': case 'length': return v.length;
        case 'number': return Number(v);
        default: throw new PlanError(`不支援的內建函式 ?${e.name}`, line);
      }
    }
    default: {
      const l = ev(e.l);
      const r = ev(e.r);
      switch (e.op) {
        case '+':
          if (typeof l === 'string' || typeof r === 'string') return String(l) + String(r);
          return num(l, '+') + num(r, '+');
        case '-': return num(l, '-') - num(r, '-');
        case '*': return num(l, '*') * num(r, '*');
        case '/': {
          if (num(r, '/') === 0) throw new PlanError('除以零', line);
          return num(l, '/') / r;
        }
        case '%': {
          if (num(r, '%') === 0) throw new PlanError('除以零', line);
          return num(l, '%') % r;
        }
        case '==': return l === r;
        case '!=': return l !== r;
        case '<': return l < r;
        case '<=': return l <= r;
        case '>': return l > r;
        case '>=': return l >= r;
        default: throw new PlanError(`未知的運算子 ${e.op}`, line);
      }
    }
  }
}

function toText(v) {
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    return String(Number(v.toPrecision(15)));
  }
  if (Array.isArray(v)) return v.map(toText).join(' ');
  return String(v);
}

// ---------- 執行 ----------

export function renderFreemarker(src) {
  const root = parseTemplate(src);
  const out = [];
  const globals = {};
  let iterations = 0;

  const run = (nodes, env) => {
    for (const node of nodes) {
      switch (node.type) {
        case 'text': out.push(node.value); break;
        case 'interp': out.push(toText(evalExpr(parseExpr(node.expr, node.line), env, node.line))); break;
        case 'assign':
          for (const a of node.assigns) {
            const v = evalExpr(a.expr, env, node.line);
            globals[a.name] = v;
            // 若在迴圈內，讓目前作用域也看到新值
            env[a.name] = v;
          }
          break;
        case 'list': {
          const seq = evalExpr(node.seq, env, node.line);
          if (!Array.isArray(seq)) throw new PlanError('<#list> 需要序列', node.line);
          for (const item of seq) {
            if (++iterations > MAX_ITERATIONS) throw new PlanError('迴圈次數過多', node.line);
            const scope = Object.create(env);
            scope[node.var] = item;
            run(node.children, scope);
          }
          break;
        }
        case 'if': {
          for (const br of node.branches) {
            if (br.cond === null || evalExpr(br.cond, env, node.line)) {
              run(br.children, env);
              break;
            }
          }
          break;
        }
        default: break;
      }
    }
  };
  run(root.children, globals);
  return out.join('');
}
