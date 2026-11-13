import bootstrapPy from '../runtime/bootstrap.py?raw';
import genPy from '../runtime/gen.py?raw';
import { PYODIDE_BASE } from '../lib/config.js';

let pyodidePromise = null;

function loadPy() {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const { loadPyodide } = await import(/* @vite-ignore */ PYODIDE_BASE + 'pyodide.mjs');
      const py = await loadPyodide({ indexURL: PYODIDE_BASE });
      py.FS.mkdirTree('/home/pyodide');
      py.FS.writeFile('/home/pyodide/gen.py', genPy);
      py.runPython(bootstrapPy);
      return py;
    })();
  }
  return pyodidePromise;
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    try {
      await loadPy();
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'init-error', error: String(err?.message || err) });
    }
  } else if (msg.type === 'run') {
    const py = await loadPy();
    const t0 = performance.now();
    let result;
    try {
      const fn = py.globals.get('_wtm_run');
      result = JSON.parse(fn(msg.req.code, JSON.stringify(msg.req)));
      fn.destroy?.();
    } catch (err) {
      result = { status: 'error', message: String(err?.message || err), stdout: '', out2: '', stderr: '' };
    }
    result.time = performance.now() - t0;
    self.postMessage({ type: 'result', id: msg.id, result });
  }
};
