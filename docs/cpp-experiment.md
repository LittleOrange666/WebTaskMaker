# 實驗：在瀏覽器中編譯並執行 C++

日期：2026-11-13
環境：Windows 11、16 核心；Node.js 24 與桌面版 Chromium 156（Claude 內建瀏覽器）；測試伺服器在本機，所以下載時間不列入。

## 使用的工具

- 編譯器：[`@yowasp/clang`](https://www.npmjs.com/package/@yowasp/clang) `22.0.0-git20542-10`（LLVM 22 編成 WASM，輸出目標為 `wasm32-wasip1`，內附 libc++）
- 執行編譯結果：[`@bjorn3/browser_wasi_shim`](https://www.npmjs.com/package/@bjorn3/browser_wasi_shim) 0.4.2（瀏覽器端的 WASI）
- testlib.h：MikeMirzayanov/testlib 的 master 版本

## 結果摘要

| 項目 | 結果 |
| --- | --- |
| 下載量 | `llvm.core.wasm` 75.5 MB（gzip 後 22.8 MB）＋ 標頭檔與函式庫 `llvm-resources.tar` 29.7 MB（gzip 後 4.3 MB），**合計約 27 MB（gzip）**。目前的主機 GitHub Pages 有開 gzip |
| 第一次編譯（含載入編譯器） | 約 2.6 秒（下載完成之後） |
| 一般程式編譯（含 `bits/stdc++.h` 替代檔） | **約 1.5～2 秒** |
| 使用 testlib.h 的程式 | **約 5 秒**（需要下面的兩個繞過方法） |
| 編譯後程式的執行速度 | 對 200 萬個數排序約 0.19 秒，速度不錯 |
| 記憶體 | Node 行程的峰值 RSS 約 870 MB（包含編譯 75 MB 的 WASM 模組）。瀏覽器裡沒辦法精確量測，但應該是同一個量級 |
| 遞迴深度 | **Chromium Worker 中 5,000 層可以，10,000 層就當掉**（Node 中 10,000 層可以、30,000 層當掉） |

## 遇到的問題與繞過方法

### 1. C++ 例外完全無法使用（已繞過）
內附的 libc++abi 不支援例外：程式裡有 `throw` / `try` 會連結失敗（找不到 `__cxa_throw`）。連 `cin` 在 `-O2` 下也會用到例外，所以**一般程式也必須加上 `-fno-exceptions`**。`-fwasm-exceptions` 同樣連結失敗。

影響：使用者的程式不能用 `try` / `throw`，`std::stoi` 等函式出錯時會直接中止。

### 2. testlib.h 需要例外（已繞過）
testlib 只有三個地方用到例外：兩處 `try { std::stoll(...) } catch`，以及一個生成器和驗證器用不到的 `throw "Unexpected verdict"`。把前兩處改用 `strtoll` 加 `errno` 檢查，`throw` 改成 `std::abort()` 之後，就能以 `-fno-exceptions` 編譯。修改後的 testlib 已確認：

- 生成器：`registerGen` + `rnd.next`，同樣的參數產生相同的輸出 ✅
- 驗證器：多餘空白、超出範圍、超大整數都正確回報（結束碼 3）✅
- checker：AC / WA / PE 的結束碼分別為 0 / 1 / 2，訊息也正確 ✅

### 3. 虛擬檔案系統寫大檔非常慢（已繞過）
testlib 編出來的目的檔約 16 MB。把它寫進 YoWASP 的虛擬檔案系統要 **約 80 秒**（`-E` 寫出前處理結果更花了 340 秒），寫入時間看起來與檔案大小不成比例。改成 `clang -c ... -o -` 讓目的檔輸出到 stdout，再另外連結，就降到 **約 5 秒**。預先編譯標頭檔（PCH）因為同樣要寫入大檔而沒有幫助。

### 4. 遞迴深度上限很低（無解）
當掉的是 JavaScript 引擎本身的原生堆疊（錯誤訊息為 "Maximum call stack size exceeded"），不是 WASM 的堆疊，所以用連結參數加大堆疊沒有用，網頁也無法調整這個上限。在 Chromium 的 Worker 中只能遞迴約 5,000～10,000 層。

影響：**對 20 萬個點的鏈狀樹做遞迴 DFS 的解答會當掉**，在正式評測機上卻是正確的。這在出題時很常見，需要在說明中提醒，或要求解答改寫成非遞迴。
（Python 透過 Pyodide 執行時也有類似的限制。）

### 5. 32 位元環境（無解，只能提醒）
已確認 `sizeof(long) == 4`、指標也是 4 bytes：`long x = 3000000000L` 會溢位，`long long` 和 `__int128` 正常。

### 6. 沒有 `bits/stdc++.h`（已繞過）
libc++ 沒有這個檔案，自己做一個 include 常用標準標頭檔的替代檔即可正常使用。

## 尚未驗證

- 手機（特別是 iPhone Safari）上的記憶體用量：很可能會因為記憶體不足而把分頁關掉
- Firefox 與 Safari 的遞迴深度與相容性
- 經由網路下載 27 MB 的實際時間；要放在 GitHub Pages 還是改用 CDN（llvm.core.wasm 75 MB，未超過 GitHub 單檔 100 MB 的上限，但超過 50 MB 會有警告）

## 結論

**技術上可行**：生成器、解答、驗證器、checker（包括 testlib）都能在瀏覽器中編譯執行，結果正確。編譯一個程式只要數秒，在整批產生測資時可以接受，而且加上快取之後每個程式只需要編譯一次。

主要的代價與限制：
1. 第一次使用要下載約 27 MB
2. 不能使用 C++ 例外（需要 `-fno-exceptions`，並內建修改過的 testlib.h）
3. 遞迴只能約 5,000 層，深度遞迴的解答會當掉
4. `long` 是 32 位元
5. 手機很可能無法使用

建議定位為桌面瀏覽器上的「實驗性功能」，並在介面與說明中寫清楚上述限制。

實驗用的程式碼放在 session 的 scratchpad（`cppexp/`）。
