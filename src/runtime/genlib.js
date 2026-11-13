// JavaScript 版內建函式庫（spec §8），與 runtime/gen.py 功能對等

export class CheckerResult extends Error {
  constructor(verdict, msg = '') {
    super(msg);
    this.verdict = verdict;
    this.msg = msg;
  }
}

export class ValidationError extends Error {}

function assertInt(x, name) {
  if (!Number.isInteger(x)) throw new TypeError(`${name} 必須是整數，收到 ${x}`);
}

/** 亂數、圖與樹相關函式 */
export function createRandomLib(random) {
  const rand_int = (lo, hi) => {
    assertInt(lo, 'lo'); assertInt(hi, 'hi');
    if (lo > hi) throw new RangeError(`rand_int: lo (${lo}) > hi (${hi})`);
    return lo + Math.floor(random() * (hi - lo + 1));
  };
  const rand_float = (lo, hi) => lo + random() * (hi - lo);
  const choice = (seq) => {
    if (!seq.length) throw new RangeError('choice: 序列為空');
    return seq[Math.floor(random() * seq.length)];
  };
  const shuffle = (seq) => {
    for (let i = seq.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [seq[i], seq[j]] = [seq[j], seq[i]];
    }
    return seq;
  };
  const sample = (seq, k) => {
    if (k > seq.length) throw new RangeError('sample: k 大於序列長度');
    const a = Array.from(seq);
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(random() * (a.length - i));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, k);
  };
  const rand_array = (n, lo, hi) => Array.from({ length: n }, () => rand_int(lo, hi));
  const distinct_array = (n, lo, hi) => {
    const size = hi - lo + 1;
    if (n > size) throw new RangeError(`distinct_array: 範圍內只有 ${size} 個數，無法取 ${n} 個`);
    if (size <= 2 * n || size <= 1e6) {
      // 部分 Fisher-Yates，用 Map 模擬大陣列
      const swapped = new Map();
      const res = [];
      for (let i = 0; i < n; i++) {
        const j = i + Math.floor(random() * (size - i));
        const vj = swapped.has(j) ? swapped.get(j) : j;
        const vi = swapped.has(i) ? swapped.get(i) : i;
        swapped.set(j, vi);
        res.push(lo + vj);
      }
      return res;
    }
    const seen = new Set();
    const res = [];
    while (res.length < n) {
      const x = rand_int(lo, hi);
      if (!seen.has(x)) { seen.add(x); res.push(x); }
    }
    return res;
  };
  const permutation = (n) => shuffle(Array.from({ length: n }, (_, i) => i + 1));
  const rand_string = (n, alphabet = 'abcdefghijklmnopqrstuvwxyz') => {
    let s = '';
    for (let i = 0; i < n; i++) s += alphabet[Math.floor(random() * alphabet.length)];
    return s;
  };
  const rand_partition = (total, k) => {
    if (k < 1 || total < k) throw new RangeError(`rand_partition: 無法把 ${total} 拆成 ${k} 個正整數`);
    const cuts = distinct_array(k - 1, 1, total - 1).sort((x, y) => x - y);
    const parts = [];
    let prev = 0;
    for (const c of cuts) { parts.push(c - prev); prev = c; }
    parts.push(total - prev);
    return parts;
  };
  const rand_tree = (n, type = 'random') => {
    const edges = [];
    const spine = Math.max(1, Math.floor(n / 2));
    for (let i = 2; i <= n; i++) {
      let p;
      switch (type) {
        case 'random': p = rand_int(1, i - 1); break;
        case 'line': p = i - 1; break;
        case 'star': p = 1; break;
        case 'binary': p = Math.floor(i / 2); break;
        case 'caterpillar': p = i <= spine ? i - 1 : rand_int(1, spine); break;
        default: throw new RangeError(`rand_tree: 未知的樹種類 ${type}`);
      }
      edges.push([p, i]);
    }
    return edges;
  };
  const relabel = (edges, n) => {
    const p = [0, ...permutation(n)];
    return shuffle(edges.map(([u, v, ...rest]) => [p[u], p[v], ...rest]));
  };
  const rand_graph = (n, m, opts = {}) => {
    const { connected = false, simple = true, directed = false } = opts;
    const maxM = directed ? n * (n - 1) : (n * (n - 1)) / 2;
    if (simple && m > maxM) throw new RangeError(`rand_graph: 簡單圖最多 ${maxM} 條邊`);
    if (connected && m < n - 1) throw new RangeError(`rand_graph: 連通圖至少需要 ${n - 1} 條邊`);
    const edges = [];
    const seen = new Set();
    const key = (u, v) => (directed || u < v ? u * (n + 1) + v : v * (n + 1) + u);
    const add = (u, v) => {
      if (simple) {
        if (u === v) return false;
        const k = key(u, v);
        if (seen.has(k)) return false;
        seen.add(k);
      }
      edges.push([u, v]);
      return true;
    };
    if (connected && n > 1) {
      for (const [u, v] of relabel(rand_tree(n), n)) {
        if (directed && random() < 0.5) add(v, u); else add(u, v);
      }
    }
    while (edges.length < m) add(rand_int(1, n), rand_int(1, n));
    return shuffle(edges);
  };
  const rand_weights = (edges, lo, hi) => edges.map((e) => [...e, rand_int(lo, hi)]);

  return {
    rand_int, rand_float, choice, shuffle, sample, rand_array, distinct_array, permutation,
    rand_string, rand_partition, rand_tree, rand_graph, rand_weights, relabel,
  };
}

/** 驗證器用的嚴格讀取器（類似 testlib） */
export class Reader {
  constructor(text) {
    this.s = text;
    this.p = 0;
  }
  _where() {
    let line = 1, col = 1;
    for (let i = 0; i < this.p && i < this.s.length; i++) {
      if (this.s[i] === '\n') { line++; col = 1; } else col++;
    }
    return `第 ${line} 行第 ${col} 字`;
  }
  _fail(msg) {
    throw new ValidationError(`${this._where()}：${msg}`);
  }
  _show(ch) {
    if (ch === undefined) return 'EOF';
    return JSON.stringify(ch);
  }
  read_token() {
    const start = this.p;
    while (this.p < this.s.length && !/\s/.test(this.s[this.p])) this.p++;
    if (this.p === start) this._fail(`預期一個 token，但遇到 ${this._show(this.s[this.p])}`);
    return this.s.slice(start, this.p);
  }
  read_int(lo, hi) {
    const start = this.p;
    const t = this.read_token();
    if (!/^-?(0|[1-9]\d*)$/.test(t) || t === '-0') {
      this.p = start;
      this._fail(`預期整數，但讀到 ${JSON.stringify(t)}`);
    }
    const v = BigInt(t);
    if ((lo !== undefined && v < BigInt(lo)) || (hi !== undefined && v > BigInt(hi))) {
      this.p = start;
      this._fail(`整數 ${t} 超出範圍 [${lo}, ${hi}]`);
    }
    return Number.isSafeInteger(Number(t)) ? Number(t) : v;
  }
  read_ints(n, lo, hi) {
    const res = [];
    for (let i = 0; i < n; i++) {
      if (i > 0) this.read_space();
      res.push(this.read_int(lo, hi));
    }
    return res;
  }
  read_line() {
    const idx = this.s.indexOf('\n', this.p);
    if (idx < 0) this._fail('預期換行，但遇到 EOF');
    const line = this.s.slice(this.p, idx);
    this.p = idx + 1;
    return line;
  }
  read_space() {
    if (this.s[this.p] !== ' ') this._fail(`預期空白，但遇到 ${this._show(this.s[this.p])}`);
    this.p++;
  }
  read_eoln() {
    if (this.s[this.p] !== '\n') this._fail(`預期換行，但遇到 ${this._show(this.s[this.p])}`);
    this.p++;
  }
  read_eof() {
    if (this.p !== this.s.length) this._fail(`預期檔案結尾，但遇到 ${this._show(this.s[this.p])}`);
  }
}

export function ensure(cond, msg = 'ensure 失敗') {
  if (!cond) throw new ValidationError(msg);
}

export function accept(msg = '') {
  throw new CheckerResult('AC', msg);
}

export function wrong(msg = '') {
  throw new CheckerResult('WA', msg);
}

export function tokens(text) {
  return String(text).split(/\s+/).filter(Boolean);
}

export function float_equal(a, b, eps = 1e-6) {
  a = Number(a); b = Number(b);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
}

/** 內建 checker：忽略行尾空白與檔尾空行，逐 token 比對 */
export function defaultCheck(output, answer) {
  const a = tokens(output);
  const b = tokens(answer);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      const cut = (s) => (s.length > 40 ? s.slice(0, 40) + '…' : s);
      return { verdict: 'WA', message: `第 ${i + 1} 個 token 不同：預期 ${cut(b[i])}，得到 ${cut(a[i])}` };
    }
  }
  if (a.length !== b.length) {
    return { verdict: 'WA', message: `token 數量不同：預期 ${b.length} 個，得到 ${a.length} 個` };
  }
  return { verdict: 'AC', message: `${a.length} 個 token 相同` };
}
