// 執行編譯好的 C++ 程式；逾時時整個 Worker 會被終止
import { executeCpp } from '../runtime/cppExec.js';

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    self.postMessage({ type: 'ready' });
  } else if (msg.type === 'run') {
    const t0 = performance.now();
    let result;
    try {
      result = await executeCpp(msg.req);
    } catch (err) {
      result = { status: 'error', message: String(err?.message || err), stdout: '', out2: '', stderr: '' };
    }
    result.time = performance.now() - t0;
    self.postMessage({ type: 'result', id: msg.id, result });
  }
};
