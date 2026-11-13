# WebTaskMaker

純靜態網頁的出題工具：在瀏覽器中產生競技程式設計題目的測試資料。規格見 [spec.md](spec.md)，使用說明在網頁內的「使用說明」頁。

## 開發

```bash
npm install
npm run dev        # 開發伺服器 http://localhost:5173
npm test           # 參數表解析、JS 執行環境、產生流程的單元測試
```

## 建置與部署

```bash
npm run build      # 輸出到 dist/
```

把 `dist/` 整個資料夾放到任何靜態主機即可，可以放在子路徑（例如 `https://example.com/some/path/`）。所有資源皆使用相對路徑。

在子路徑下測試建置結果：

```bash
node scripts/serve-subpath.mjs 4173 /some/path/
```

然後開啟 http://localhost:4173/some/path/ 。

Python 執行環境（Pyodide）與 C++ 編譯器（`@yowasp/clang`，實驗性）於第一次使用時從 jsDelivr CDN 載入固定版本，設定在 `src/lib/config.js`。C++ 的實驗結果見 [docs/cpp-experiment.md](docs/cpp-experiment.md)。

內建的 `src/runtime/cpp/testlib.h` 是修改過的 testlib（可以用 `-fno-exceptions` 編譯），由原版產生：

```bash
node scripts/patch-testlib.mjs path/to/original/testlib.h
```

## 程式結構

| 路徑 | 說明 |
| --- | --- |
| `src/App.svelte` | 主畫面、狀態管理、下載與上傳 |
| `src/components/` | 檔案列表、程式編輯器（CodeMirror 6）、執行結果、簡單測試、使用說明 |
| `src/lib/tps.js`、`freemarker.js` | 參數表解析 |
| `src/lib/pipeline.js` | 產生測資、驗證、比對、測試額外解答 |
| `src/lib/runner.js` | Web Worker 管理、逾時與停止 |
| `src/lib/project.js` | 專案資料、localStorage、zip |
| `src/runtime/` | 在 Worker 中執行使用者程式：`jsExec.js`、`genlib.js`（JS 內建函式庫）、`gen.py`、`bootstrap.py`（Python）、`cppExec.js`（C++ / WASI） |
| `src/runtime/cpp/` | C++ 內建標頭檔：`bits/stdc++.h` 替代檔、修改過的 `testlib.h` |
| `src/workers/` | `js` / `py` 執行 Worker、`cppc`（C++ 編譯）、`cppx`（執行編譯好的 C++） |
| `src/examples/` | 範例專案 |
