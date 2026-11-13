// Pyodide 由 CDN 載入，固定版本（spec §13）
export const PYODIDE_VERSION = '0.27.2';
export const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// C++ 編譯器（@yowasp/clang）的來源，固定版本（spec §14.1）
// 預設由 jsDelivr 載入；若要自行託管，把 gen/ 資料夾的內容放到網站中，
// 並把 CLANG_BASE 改成相對於本檔案的位置，例如 new URL('../../clang/', import.meta.url).href
export const CLANG_VERSION = '22.0.0-git20542-10';
export const CLANG_BASE = `https://cdn.jsdelivr.net/npm/@yowasp/clang@${CLANG_VERSION}/gen/`;

// C++ 編譯參數（spec §14.2）
export const CPP_COMPILE_FLAGS = ['-std=c++20', '-O2', '-fno-exceptions'];
export const CPP_LINK_FLAGS = ['-O2', '-fno-exceptions', '-Wl,-z,stack-size=67108864'];
// 編譯本身的逾時（與程式執行的逾時分開）
export const CPP_COMPILE_TIMEOUT_MS = 180_000;

export const STORAGE_KEY = 'webtaskmaker.project.v1';
export const QUICKRUN_STORAGE_KEY = 'webtaskmaker.quickrun.v1';
