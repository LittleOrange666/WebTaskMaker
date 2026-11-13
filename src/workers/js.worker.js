import { executeJs } from '../runtime/jsExec.js';

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    self.postMessage({ type: 'ready' });
  } else if (msg.type === 'run') {
    const result = executeJs(msg.req);
    self.postMessage({ type: 'result', id: msg.id, result });
  }
};
