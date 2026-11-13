# 純網頁出題工具 (WebTaskMaker)

一個**純靜態網頁**的出題工具，用於產生競技程式設計比賽題目所需的測試資料。所有程式都在使用者的瀏覽器中執行，不需要後端伺服器；測資可直接在網頁上產生、檢查與下載。

- 介面語言：繁體中文
- 部署：任何靜態主機皆可（例如 GitHub Pages）

---

## 1. 使用流程概覽

1. 建立/開啟專案（自動從 localStorage 還原上次的專案）
2. 撰寫或上傳檔案：生成器、參數表、解答、（可選）手生測資、驗證器、checker、額外解答
3. 按「產生測資」：
   1. 依參數表執行生成器 → 得到每筆 `.in`
   2. 驗證器檢查每筆 `.in`
   3. 執行標準解答 → 得到每筆 `.out`
4. （可選）按「測試解答」：執行額外解答並用 checker 判定，顯示結果表
5. 下載測資 zip / 下載 checker（若有）/ 下載專案 zip

另有獨立的「簡單測試」頁面，可直接執行一段程式並取得輸出（見 §15）。

---

## 2. 輸出模式

使用者可選擇以下兩種模式之一：

| 模式 | 說明 |
| --- | --- |
| **生成輸入後求輸出**（預設） | 生成器只產生 `.in`，再由標準解答讀取 `.in` 產生 `.out` |
| **直接生成輸入輸出** | 生成器同時產生 `.in` 與 `.out`（適合「先決定答案再構造輸入」的題目），此時標準解答為可選 |

在「直接生成輸入輸出」模式下，生成器透過內建 API 分別寫入輸入與輸出（見 §5.1）。若同時提供標準解答，會額外以 checker 比對生成器的 `.out` 與解答的輸出，不一致則報錯。

---

## 3. 支援的程式語言

使用者提交的所有程式（生成器、解答、驗證器、checker）可使用：

- **Python**：透過 Pyodide (WASM) 執行，首次使用時才下載 Pyodide
- **JavaScript**：直接在 Web Worker 中執行
- **C++（實驗性功能）**：在瀏覽器中以 WASM 版 clang 編譯後執行，僅保證桌面瀏覽器可用，有數項限制，詳見 §14

每個程式檔以副檔名（`.py` / `.js` / `.cpp`）決定語言，同一專案中可混用。參數表腳本（§6.3）只支援 Python / JS。

---

## 4. 專案檔案

| 檔案 | 必要 | 說明 |
| --- | --- | --- |
| 參數表 | ✅ | 描述要產生哪些測資，三種格式擇一（見 §6） |
| 生成器程式碼 | ✅ | 一或多個生成器，參數表以檔名（不含副檔名）呼叫 |
| 標準解答 | ✅（直接生成輸入輸出模式下可選） | 產生 `.out` |
| 手生測資 | 可選 | 手動上傳或撰寫的 `.in`（及可選 `.out`），可在參數表中引用 |
| 格式驗證器 | 可選 | 檢查 `.in` 格式與限制 |
| checker | 可選 | 判定解答輸出是否正確；未提供時使用內建 checker（見 §7.3） |
| 額外解答 | 可選 | 多份，各自標記預期結果（AC / WA / TLE / RE / 任意） |

---

## 5. 程式介面

所有程式在 Web Worker 中執行，以「標準輸入 / 標準輸出 / 命令列參數」模擬傳統的命令列程式介面。本節描述 Python / JS 的介面；C++ 採用 testlib 慣例，見 §14.3。

### 5.1 生成器

- **參數**：從參數表取得，Python 以 `sys.argv[1:]`、JS 以全域 `argv` 陣列取得
- **輸出**：寫到標準輸出（Python `print`、JS 內建 `print()` / `write()`）即為 `.in` 內容
- **直接生成輸入輸出模式**：使用內建 `out.print()` / `out.write()` 寫入 `.out`
- **亂數種子**：預設由「生成器名稱 + 參數字串」雜湊得出，確保**同一行參數每次產生相同結果**（類似 testlib）。參數表可用 `seed=<n>` 覆寫
  - 內建亂數函式（§8）一律使用此種子；Python 的 `random` 模組與 JS 的 `Math.random` 也會被預先設定 / 替換為同一種子

### 5.2 標準解答與額外解答

- 從標準輸入讀取 `.in`，輸出到標準輸出
- Python 可正常使用 `input()`、`sys.stdin`；JS 提供 `readline()`、`readAll()` 等內建函式

### 5.3 格式驗證器

- 從標準輸入讀取 `.in`
- 可取得目前測資所屬的子任務名稱（Python `sys.argv[1]`、JS `argv[0]`），用於子任務專屬限制
- 正常結束 = 通過；拋出例外或非零結束 = 失敗，錯誤訊息會顯示在介面上
- 提供內建的嚴格讀取工具（類似 testlib 的 `readInt(lo, hi)`、`readSpace()`、`readEoln()`、`readEof()`），見 §8

### 5.4 checker

- 介面：以字串變數 `input_data`（`.in`）、`output_data`（待測輸出）、`answer_data`（`.out`）取得三個內容
- 正常結束而未呼叫 `accept` / `wrong` 視為 AC；執行錯誤視為 checker 失敗
- 回傳結果：`AC` 或 `WA`（附可選訊息）；格式錯誤可回傳 `PE`（視為 WA 的一種）
- Python / JS 皆以內建函式 `accept(msg)` / `wrong(msg)` 回報結果

---

## 6. 參數表

使用者可在三種格式中**擇一**使用：

### 6.1 類 TPS gen/data 格式

參考 [TPS gen/data](https://github.com/ioi-2017/tps/blob/master/docs/README.md)。每行一筆測資：

```
# 註解
@subtask samples
manual sample1.in
manual sample2.in

@subtask small
@include samples
gen_random 10 1 100
gen_random 10 1 100 seed=42
gen_tree 10 line

@subtask full
@include small
gen_random 200000 1 1000000000
```

- `@subtask <名稱>`：開始一個子任務，之後的測資都屬於它
- `@include <子任務名稱>`：把另一個子任務的測資也算進來（只影響驗證器檢查與子任務對照表，不會重複產生檔案）
- `manual <檔名>`：引用手生測資
- `<生成器名稱> <參數...>`：執行生成器

### 6.2 類 Polygon FreeMarker 子集

參考 [Polygon FreeMarker 說明](https://polygon.codeforces.com/docs/freemarker-manual)。僅支援常用子集：

- `<#assign x = 運算式>`
- `<#list a..b as i> ... </#list>`
- `<#if 條件> ... <#elseif 條件> ... <#else> ... </#if>`
- `${運算式}`：支援整數與字串運算、`+ - * / %`、比較與邏輯運算
- 展開後的結果按 §6.1 格式解析（因此也可使用 `@subtask` 等指令）

```
<#list 1..5 as i>
gen_random ${i * 1000} 1 100
</#list>
```

### 6.3 Python / JS 腳本

參數表本身是一段 Python 或 JS 程式，透過內建 API 宣告測資：

```python
subtask("small")
for n in [10, 100, 1000]:
    test("gen_random", n, 1, 100)
manual("sample1.in")
include("samples")
```

執行完畢後得到的測資清單，與 §6.1 格式的結果等價。

### 6.4 子任務與檔名

- 測資依參數表中出現的順序連號輸出：`1.in`/`1.out`、`2.in`/`2.out`…
- 子任務僅用於分組與驗證器參數；另外會在 zip 中附上 `subtasks.json`，記錄每個子任務包含哪些測資編號

---

## 7. 執行與錯誤處理

### 7.1 執行環境

- 所有使用者程式都在 **Web Worker** 中執行，不阻塞介面
- Python 與 JS 各自有 Worker；Pyodide 在 Worker 內載入一次並重複使用
- 每次執行之間重置使用者程式的全域狀態（避免前一筆測資影響下一筆）

### 7.2 逾時

- 每次執行有逾時上限（預設 10 秒，可在設定中調整）
- 逾時時強制終止 Worker 並重新建立，該筆標記為 TLE
- 介面提供「停止」按鈕可隨時中止整批產生

### 7.3 驗證與比對

- **驗證器失敗即中止**：任何一筆 `.in` 驗證失敗，該筆標紅並顯示錯誤訊息，**禁止下載測資 zip** 直到修正
- 生成器 / 標準解答執行錯誤或逾時，同樣禁止下載
- **內建 checker**（未提供 checker 時使用）：忽略行尾空白與檔尾空行，逐 token 比對

### 7.4 測試額外解答

- 對每份額外解答，在所有測資上執行並用 checker 判定
- 結果以表格顯示：列 = 解答，欄 = 測資（並依子任務彙總），每格顯示 AC / WA / TLE / RE 與執行時間
- 若結果與該解答的預期標記不符，以醒目顏色提示
- 解答的執行時間僅供參考（瀏覽器 / WASM 與正式評測環境差異大）

### 7.5 測資預覽

- 產生後可點選每筆測資，預覽 `.in` / `.out` 內容（過大的檔案只顯示開頭部分）及檔案大小

---

## 8. 內建工具函式庫

Python 與 JS 提供功能對等的內建函式庫（Python 為 `from gen import *`，JS 為全域物件 `gen`），所有亂數皆使用 §5.1 的種子。

**亂數**

- `rand_int(lo, hi)`、`rand_float(lo, hi)`、`choice(seq)`、`shuffle(seq)`、`sample(seq, k)`
- `rand_array(n, lo, hi)`、`distinct_array(n, lo, hi)`、`permutation(n)`
- `rand_string(n, alphabet)`、`rand_partition(total, k)`（把 total 拆成 k 個正整數）

**圖與樹**

- `rand_tree(n, type)`：type 可為 `random`、`line`、`star`、`binary`、`caterpillar` 等
- `rand_graph(n, m, connected=False, simple=True, directed=False)`
- `rand_weights(edges, lo, hi)`、`relabel(edges, n)`（隨機重新編號節點）

**輸出輔助**

- `print_array(arr, sep=" ")`、`print_edges(edges)`、`print_matrix(mat)`

**驗證器輔助（嚴格讀取）**

- `read_int(lo, hi)`、`read_ints(n, lo, hi)`、`read_token()`、`read_space()`、`read_eoln()`、`read_eof()`
- `ensure(cond, msg)`

**checker 輔助**

- `accept(msg)`、`wrong(msg)`、`tokens(text)`、`float_equal(a, b, eps)`

---

## 9. 教學與範例

- 網頁內建使用說明頁：介紹流程、程式介面、三種參數表格式、內建函式庫 API、簡單測試
- 提供可一鍵載入的範例專案（Python 與 JS 各一套），例如：
  - A+B Problem（最小範例）
  - 樹上問題（示範 `rand_tree`、子任務、驗證器）
  - 浮點答案題（示範自訂 checker）
  - 直接生成輸入輸出的範例
- 載入範例前若目前專案有未下載的內容，需要使用者確認

---

## 10. 狀態管理

- 專案內容（所有程式碼、參數表、手生測資、設定）自動存到 **localStorage**
  - 超出容量（約 5MB）時提示使用者，並建議下載專案 zip 備份
  - 產生出的測資**不**存入 localStorage（可隨時重新產生）
- **下載專案 zip**：包含所有專案檔案與 `project.json`（設定、模式、各解答的預期結果等）
- **上傳專案 zip**：還原完整專案
- 同一時間只維護一個專案

---

## 11. 輸出

- 測資 zip 內容：
  - `1.in`、`1.out`、`2.in`、`2.out`…
  - `subtasks.json`：子任務 → 測資編號對照
- 測資 zip **不包含** checker；若專案有自訂 checker，另外提供「下載 checker」按鈕，單獨下載 `checker.py` / `checker.js` / `checker.cpp`（C++ checker 若引用 testlib，提示使用者評測端需搭配原版 testlib.h）
- 所有檔案皆在瀏覽器端產生並下載

---

## 12. 技術選型（建議）

| 項目 | 選擇 |
| --- | --- |
| Python 執行 | Pyodide（WASM），在 Web Worker 中執行 |
| 程式編輯器 | CodeMirror 6（語法高亮：Python / JS / C++ / 參數表） |
| C++ 編譯 | `@yowasp/clang`（LLVM/Clang 編成 WASM，輸出 `wasm32-wasip1`，固定版本），在 Web Worker 中執行 |
| C++ 程式執行 | `@bjorn3/browser_wasi_shim`（瀏覽器端 WASI） |
| zip 處理 | JSZip |
| 前端框架 | Svelte + Vite（建置輸出純靜態檔案，不需後端） |

---

## 13. 部署與路徑

- 主頁面為 `index.html`，預期靜態主機會正確提供它（例如請求目錄時自動回傳 `index.html`）
- **不保證部署在網域根目錄**：網站可能位於任意子路徑，例如 `https://some.domain.name/some/path/` 指向此處的 `index.html`
- 因此所有資源一律使用**相對路徑**，不可寫死以 `/` 開頭的絕對路徑：
  - Vite 設定 `base: './'`，讓建置後的 JS / CSS / 圖片引用都是相對路徑
  - Web Worker、Pyodide 檔案、內建函式庫、範例專案等執行時才載入的資源，以 `new URL('相對路徑', import.meta.url)` 或相對於 `document.baseURI` 解析
  - Pyodide 與 C++ 編譯器預設由 CDN 載入固定版本；若改為自行託管，載入位置也要用解析後的相對位置
- 不使用需要伺服器改寫規則的前端路由（history mode）；說明頁、範例等頁面切換用 hash（如 `#/docs`）或單頁內切換，確保在子路徑下重新整理不會 404
- 部署前需測試：在子路徑下（例如本機以 `/some/path/` 提供建置輸出）所有功能正常

---

## 14. C++ 支援（實驗性功能）

依據 [docs/cpp-experiment.md](docs/cpp-experiment.md) 的實驗結果設計。定位為**桌面瀏覽器限定的實驗性功能**。

### 14.1 載入編譯器

- 只有在需要執行 C++ 程式時（專案中的 `.cpp` 檔或簡單測試），才下載編譯器（未壓縮約 105 MB），並顯示下載進度
- 編譯器在專用的 Web Worker 中載入並重複使用
- 編譯器檔案的來源（固定版本），網址集中設定在 `src/lib/config.js`，可切換：
  - **預設：jsDelivr CDN**（`https://cdn.jsdelivr.net/npm/@yowasp/clang@<版本>/gen/`），與 Pyodide 相同來源
    - 已實測：可提供 75 MB 的單檔、以 brotli 壓縮後合計約 18 MB、允許跨網域（`access-control-allow-origin: *`）、快取一年且不可變（`immutable`）
    - 不需要把編譯器檔案放進 repo
  - **備案：自行託管**，建置時從 npm 套件複製到輸出資料夾，以相對路徑載入（符合 §13）。用於內網 / 離線部署，或使用者無法連線到 jsDelivr 的情況
    - 不把編譯器檔案 commit 進 repo（單檔 75 MB，且每次升級版本都會讓 repo 歷史增加約 105 MB），改由建置流程產生

### 14.2 編譯

- 編譯參數固定為 `-std=c++20 -O2 -fno-exceptions`，連結時加大 WASM 堆疊
- 兩段式編譯：`clang++ -c` 將目的檔輸出到 stdout，再另外連結（避開編譯器虛擬檔案系統寫入大檔極慢的問題）
- **快取**：以「原始碼 + 編譯參數」的雜湊值快取編譯結果，同一份程式在一次工作階段中只編譯一次；編譯結果不存入 localStorage
- 編譯錯誤視為該程式所在步驟失敗（例如「生成失敗」），顯示編譯器的錯誤訊息
- 內建標頭檔：
  - `bits/stdc++.h`：libc++ 沒有此檔，提供 include 常用標準標頭檔的替代檔
  - `testlib.h`：內建修改過的版本，把需要 C++ 例外的部分（`std::stoll` / `std::stoull` 的 try/catch、`throw`）改寫為不需例外的寫法；使用者以 `#include "testlib.h"` 引用

### 14.3 程式介面（testlib 慣例）

| 角色 | 介面 |
| --- | --- |
| 生成器 | 參數由 `argv` 取得（可用 testlib 的 `registerGen(argc, argv, 1)` 與 `rnd`），輸出到 stdout 即為 `.in`。testlib 依全部參數決定種子，因此同一行參數產生相同結果；參數表中的 `seed=<n>` 會以 `seed=<n>` 的形式附加為最後一個參數 |
| 直接生成輸入輸出模式 | 生成器另外把 `.out` 寫到檔案 `answer.out`（工作目錄中） |
| 標準解答 / 額外解答 | 從 stdin 讀、寫到 stdout |
| 格式驗證器 | 從 stdin 讀；屬於子任務時傳入 `--group <子任務名稱>`（testlib 的 `validator.group()` 可取得）；結束碼 0 = 通過，其他 = 失敗，stderr 為錯誤訊息 |
| checker | 以 `checker <input> <output> <answer>` 的形式取得三個檔案路徑（testlib 的 `registerTestlibCmd`）；結束碼 0 = AC、1 = WA、2 = PE，其他 = checker 失敗；stderr 為訊息 |

### 14.4 已知限制（需在介面與使用說明中提醒）

- **不能使用 C++ 例外**：程式中不可使用 `try` / `throw`，標準函式庫的錯誤（例如 `std::stoi` 失敗）會直接中止程式
- **遞迴深度約 5,000 層**：受瀏覽器原生堆疊限制，無法調整。遞迴過深時程式會當掉，結果標示為 RE 並附上提示「可能是遞迴太深，評測機上可能正常」
- **32 位元環境**：`long` 與指標為 4 bytes，`long` 存放超過 2^31 的數會溢位（`long long`、`__int128` 正常）。使用說明需特別提醒，避免產生錯誤的標準輸出
- **手機**：編譯時需要數百 MB 記憶體，手機上可能失敗；在手機上載入含 C++ 的專案時顯示警告
- 執行時間比原生慢，僅供參考（同 §7.4）

### 14.5 範例

- 新增一個 C++ 範例專案：testlib 生成器、驗證器、checker 與 C++ 標準解答

### 14.6 待確認

- iPhone Safari、Firefox、Safari 上的相容性、記憶體用量與遞迴深度
- 實際經由網路從 jsDelivr 下載編譯器的時間
- testlib 的 `--group` 參數解析在修改版中可正常運作

---

## 15. 簡單測試

獨立於專案流程之外的小工具：給定一段程式碼與輸入，執行並取得輸出。用途例如快速試跑一段解答、確認某筆輸入的答案、檢查生成器的輸出。

### 15.1 介面

- 以獨立頁面呈現（hash 路由 `#/run`，符合 §13），頂端導覽列與「工作區」「使用說明」並列
- 頁面包含：
  - **語言選擇**：C++ / Python / JavaScript
  - **程式碼編輯器**：CodeMirror，依語言切換語法高亮
  - **命令列參數**（可選）：以空白分隔，傳給程式的 `argv`
  - **輸入（stdin）**：多行文字框，也可上傳檔案作為輸入
  - **執行按鈕**與**停止按鈕**
  - **結果區**：
    - 輸出（stdout），可複製或下載為檔案；過大時只顯示開頭部分（同 §7.5）
    - 錯誤輸出（stderr）與編譯錯誤訊息
    - 狀態：正常結束 / 執行錯誤（附結束碼或例外訊息）/ 逾時，以及執行時間（僅供參考）
- **從專案載入**：可選擇目前專案中的任一程式檔（生成器、解答、驗證器、checker、額外解答）帶入編輯器，或選擇手生測資 / 已產生的測資作為輸入；帶入的是複本，修改不會影響專案

### 15.2 執行方式

- 沿用與專案相同的執行環境（§7.1 的 Web Worker、§7.2 的逾時設定）
- 程式以「解答」的介面執行：從 stdin 讀、寫到 stdout，可取得命令列參數
  - Python / JS 可使用內建函式庫（§8），亂數種子固定為 0
  - C++ 照 §14 編譯（含快取、內建 `bits/stdc++.h` 與 testlib.h），限制同 §14.4
- 執行簡單測試時，若專案正在產生測資，兩者共用 Worker，所以按鈕需等待目前的工作結束（或提示使用者先停止）

### 15.3 狀態保存

- 簡單測試的內容（語言、程式碼、參數、輸入）自動存到 localStorage，與專案分開保存，**不**包含在專案 zip 中
- 輸出結果不保存

---

## 16. 不在範圍內（目前）

- C++ 以外需編譯的語言
- 多專案管理、雲端同步、多人協作
- 題目敘述（statement）編寫
- 互動題（interactive）
- 精確的執行時間 / 記憶體限制判定
