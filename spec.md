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

每個程式檔以副檔名（`.py` / `.js`）決定語言，同一專案中可混用。

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

所有程式在 Web Worker 中執行，以「標準輸入 / 標準輸出 / 命令列參數」模擬傳統的命令列程式介面。

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

- 網頁內建使用說明頁：介紹流程、程式介面、三種參數表格式、內建函式庫 API
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
- 測資 zip **不包含** checker；若專案有自訂 checker，另外提供「下載 checker」按鈕，單獨下載 `checker.py` / `checker.js`
- 所有檔案皆在瀏覽器端產生並下載

---

## 12. 技術選型（建議）

| 項目 | 選擇 |
| --- | --- |
| Python 執行 | Pyodide（WASM），在 Web Worker 中執行 |
| 程式編輯器 | CodeMirror 6（語法高亮：Python / JS / 參數表） |
| zip 處理 | JSZip |
| 前端框架 | Svelte + Vite（建置輸出純靜態檔案，不需後端） |

---

## 13. 部署與路徑

- 主頁面為 `index.html`，預期靜態主機會正確提供它（例如請求目錄時自動回傳 `index.html`）
- **不保證部署在網域根目錄**：網站可能位於任意子路徑，例如 `https://some.domain.name/some/path/` 指向此處的 `index.html`
- 因此所有資源一律使用**相對路徑**，不可寫死以 `/` 開頭的絕對路徑：
  - Vite 設定 `base: './'`，讓建置後的 JS / CSS / 圖片引用都是相對路徑
  - Web Worker、Pyodide 檔案、內建函式庫、範例專案等執行時才載入的資源，以 `new URL('相對路徑', import.meta.url)` 或相對於 `document.baseURI` 解析
  - Pyodide 若自行託管，`indexURL` 也要用解析後的相對位置；若改用 CDN 則需固定版本
- 不使用需要伺服器改寫規則的前端路由（history mode）；說明頁、範例等頁面切換用 hash（如 `#/docs`）或單頁內切換，確保在子路徑下重新整理不會 404
- 部署前需測試：在子路徑下（例如本機以 `/some/path/` 提供建置輸出）所有功能正常

---

## 14. 不在範圍內（目前）

- C++ 或其他需編譯語言
- 多專案管理、雲端同步、多人協作
- 題目敘述（statement）編寫
- 互動題（interactive）
- 精確的執行時間 / 記憶體限制判定
