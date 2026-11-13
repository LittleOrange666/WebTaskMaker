// Pyodide 由 CDN 載入，固定版本（spec §13）
export const PYODIDE_VERSION = '0.27.2';
export const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// C++ 編譯器（@yowasp/clang）的來源，固定版本（spec §14.1）
// 預設由 jsDelivr 載入；若要自行託管，把 @yowasp/clang 的 gen/ 資料夾內容放到網站中，
// 建置時以環境變數 VITE_CLANG_BASE 指定位置（結尾要有 /），例如 VITE_CLANG_BASE=./clang/ npm run build
// 相對路徑以網頁位置（document.baseURI）為準
export const CLANG_VERSION = '22.0.0-git20542-10';
const CLANG_CDN = `https://cdn.jsdelivr.net/npm/@yowasp/clang@${CLANG_VERSION}/gen/`;
/** 在主執行緒解析編譯器位置（Worker 中無法得知網頁位置），再傳給編譯 Worker */
export function resolveClangBase(pageUrl) {
  const override = import.meta.env?.VITE_CLANG_BASE;
  return override ? new URL(override, pageUrl).href : CLANG_CDN;
}

// C++ 編譯參數（spec §14.2）
export const CPP_COMPILE_FLAGS = ['-std=c++20', '-O2', '-fno-exceptions'];
export const CPP_LINK_FLAGS = ['-O2', '-fno-exceptions', '-Wl,-z,stack-size=67108864'];
// 編譯本身的逾時（與程式執行的逾時分開）
// （iPhone 上編譯一個使用 testlib 的檔案可能要兩分鐘以上）
export const CPP_COMPILE_TIMEOUT_MS = 600_000;

export const STORAGE_KEY = 'webtaskmaker.project.v1';
export const QUICKRUN_STORAGE_KEY = 'webtaskmaker.quickrun.v1';
