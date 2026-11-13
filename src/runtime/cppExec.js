// 執行編譯好的 C++（WASI）程式，並依角色解讀結果（spec §14.3）
import { WASI, File, OpenFile, PreopenDirectory, Fd, wasi as wasiDefs } from '@bjorn3/browser_wasi_shim';

/** 收集寫入內容的 fd；以串列保存區塊，避免每次寫入都重新配置記憶體 */
class ChunkSink extends Fd {
  constructor() {
    super();
    this.chunks = [];
    this.size = 0;
  }
  fd_write(data) {
    this.chunks.push(data.slice());
    this.size += data.byteLength;
    return { ret: 0, nwritten: data.byteLength };
  }
  fd_fdstat_get() {
    const st = new wasiDefs.Fdstat(wasiDefs.FILETYPE_REGULAR_FILE, 0);
    st.fs_rights_base = BigInt(wasiDefs.RIGHTS_FD_WRITE);
    return { ret: 0, fdstat: st };
  }
  fd_filestat_get() {
    return { ret: 0, filestat: new wasiDefs.Filestat(0n, wasiDefs.FILETYPE_REGULAR_FILE, BigInt(this.size)) };
  }
  fd_seek() { return { ret: wasiDefs.ERRNO_SPIPE, offset: 0n }; }
  fd_tell() { return { ret: wasiDefs.ERRNO_SPIPE, offset: 0n }; }
  text() {
    const out = new Uint8Array(this.size);
    let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    return new TextDecoder().decode(out);
  }
}

/** 開啟時回傳 ChunkSink 的檔案（給直接生成輸入輸出模式的 answer.out 使用） */
class SinkFile extends File {
  constructor() {
    super(new ArrayBuffer(0));
    this.sink = new ChunkSink();
  }
  path_open() {
    return { ret: 0, fd_obj: this.sink };
  }
}

const moduleCache = new Map();
const enc = new TextEncoder();

function describeTrap(e) {
  const msg = String(e?.message || e);
  if (/call stack|stack overflow|too much recursion/i.test(msg)) {
    return `程式當掉：${msg}\n可能是遞迴太深（瀏覽器中約只能遞迴 5,000 層），在評測機上可能正常。`;
  }
  return `程式當掉（runtime error）：${msg}`;
}

/**
 * req: { role, key, wasm, argv, stdin, extra, filename }
 * 回傳與 jsExec 相同格式：{ status, stdout, out2, stderr, verdict?, message? }
 */
export async function executeCpp(req) {
  let mod = moduleCache.get(req.key);
  if (!mod) {
    if (!req.wasm) return { status: 'error', missingModule: true, message: '缺少程式', stdout: '', out2: '', stderr: '' };
    mod = await WebAssembly.compile(req.wasm);
    moduleCache.set(req.key, mod);
  }

  const role = req.role;
  const stdout = new ChunkSink();
  const stderr = new ChunkSink();
  const files = new Map();
  let argv = (req.argv ?? []).map(String);
  let answerFile = null;

  if (role === 'checker') {
    files.set('input.txt', new File(enc.encode(req.extra?.input ?? ''), { readonly: true }));
    files.set('output.txt', new File(enc.encode(req.extra?.output ?? ''), { readonly: true }));
    files.set('answer.txt', new File(enc.encode(req.extra?.answer ?? ''), { readonly: true }));
    argv = ['input.txt', 'output.txt', 'answer.txt'];
  }
  if (role === 'generator') {
    answerFile = new SinkFile();
    files.set('answer.out', answerFile);
  }

  const fds = [
    new OpenFile(new File(enc.encode(req.stdin ?? ''), { readonly: true })),
    stdout,
    stderr,
    new PreopenDirectory('/', files),
  ];
  const wasi = new WASI([req.filename ?? 'main', ...argv], [], fds);

  let code;
  let trap = null;
  try {
    const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasi.wasiImport });
    code = wasi.start(inst);
  } catch (e) {
    trap = e;
  }

  const res = {
    status: 'ok',
    stdout: stdout.text(),
    stderr: stderr.text(),
    out2: answerFile && answerFile.sink.size ? answerFile.sink.text() : '',
  };
  const errText = res.stderr.trim();

  if (trap) {
    res.status = 'error';
    res.message = describeTrap(trap) + (errText ? `\n${errText}` : '');
    return res;
  }

  if (role === 'checker') {
    // testlib 慣例：0 = AC、1 = WA、2 = PE，其他 = checker 失敗
    if (code === 0) { res.verdict = 'AC'; res.message = errText; }
    else if (code === 1) { res.verdict = 'WA'; res.message = errText; }
    else if (code === 2) { res.verdict = 'PE'; res.message = errText; }
    else { res.status = 'error'; res.message = `checker 結束碼 ${code}${errText ? `：${errText}` : ''}`; }
    return res;
  }

  if (code !== 0) {
    res.status = 'error';
    res.message = `程式以結束碼 ${code} 結束${errText ? `：${errText}` : ''}`;
  }
  return res;
}
