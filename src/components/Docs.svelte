<script>
  const SECTIONS = [
    ['flow', '使用流程'],
    ['modes', '兩種模式'],
    ['files', '專案檔案'],
    ['iface', '程式介面'],
    ['plan', '參數表'],
    ['lib', '內建函式庫'],
    ['run', '執行與錯誤'],
    ['save', '儲存與下載'],
    ['cpp', 'C++（實驗性）'],
    ['quick', '簡單測試'],
  ];

  function jump(id) {
    document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

<div class="docs">
  <aside class="toc">
    <strong>目錄</strong>
    {#each SECTIONS as [id, title]}
      <button onclick={() => jump(id)}>{title}</button>
    {/each}
  </aside>

  <article>
    <h1>WebTaskMaker 使用說明</h1>
    <p>WebTaskMaker 是一個純靜態網頁的出題工具，用來產生競技程式設計題目的測試資料。所有程式都在你的瀏覽器中執行，不會上傳到任何伺服器。</p>
    <p>最快的上手方式：點右上角「範例」載入一個範例專案，按「▶ 產生測資」，再對照下面的說明閱讀範例中的程式碼。</p>

    <h2 id="doc-flow">使用流程</h2>
    <ol>
      <li>在左側檔案列表撰寫或上傳：參數表、生成器、標準解答，以及可選的手生測資、格式驗證器、checker、額外解答。</li>
      <li>按「▶ 產生測資」：依參數表執行生成器得到每筆 <code>.in</code>，用驗證器檢查，再執行標準解答得到 <code>.out</code>。</li>
      <li>（可選）按「測試額外解答」：在所有測資上執行額外解答，用 checker 判定是否符合預期結果。</li>
      <li>按「⤓ 下載測資 zip」下載 <code>1.in</code>、<code>1.out</code>…；若有自訂 checker，可用「⤓ 下載 checker」另外下載。</li>
    </ol>

    <h2 id="doc-modes">兩種模式</h2>
    <dl>
      <dt>生成輸入後求輸出（預設）</dt>
      <dd>生成器只產生 <code>.in</code>，再由標準解答讀取 <code>.in</code> 產生 <code>.out</code>。</dd>
      <dt>直接生成輸入輸出</dt>
      <dd>生成器同時產生 <code>.in</code> 與 <code>.out</code>：印到標準輸出的內容是 <code>.in</code>，用 <code>out.print()</code> 寫的內容是 <code>.out</code>。適合「先決定答案再構造輸入」的題目。此模式下標準解答可省略；若有提供，會用 checker 比對解答輸出與生成器的 <code>.out</code>，不一致就報錯。</dd>
    </dl>

    <h2 id="doc-files">專案檔案</h2>
    <table>
      <thead><tr><th>檔案</th><th>必要</th><th>說明</th></tr></thead>
      <tbody>
        <tr><td>參數表</td><td>✅</td><td>描述要產生哪些測資，三種格式擇一（見下方）</td></tr>
        <tr><td>生成器</td><td>✅</td><td>可以有多個；參數表以「檔名去掉副檔名」呼叫，例如 <code>gen_random.py</code> 寫成 <code>gen_random</code></td></tr>
        <tr><td>標準解答</td><td>✅*</td><td>產生 <code>.out</code>（直接生成輸入輸出模式下可省略）</td></tr>
        <tr><td>手生測資</td><td></td><td>手寫的 <code>.in</code>，用 <code>manual 檔名</code> 引用；若同時有同名的 <code>.out</code>，會拿來和標準解答的輸出比對</td></tr>
        <tr><td>格式驗證器</td><td></td><td>檢查每筆 <code>.in</code> 的格式與限制</td></tr>
        <tr><td>checker</td><td></td><td>判定輸出是否正確；未提供時使用內建 checker</td></tr>
        <tr><td>額外解答</td><td></td><td>可以有多份，各自標記預期結果：AC / WA / TLE / RE / 任意</td></tr>
      </tbody>
    </table>
    <p>程式可以用 Python（<code>.py</code>）、JavaScript（<code>.js</code>）或 C++（<code>.cpp</code>，實驗性功能，見<button class="inline" onclick={() => jump('cpp')}>C++ 一節</button>）撰寫，由副檔名決定，同一專案中可以混用。第一次執行 Python 時會從 CDN 下載 Pyodide 執行環境，需要數秒到數十秒。</p>

    <h2 id="doc-iface">程式介面</h2>
    <p>所有程式都模擬傳統命令列程式：從標準輸入讀、寫到標準輸出、從命令列參數取得參數。</p>

    <h3>生成器</h3>
    <table>
      <thead><tr><th></th><th>Python</th><th>JavaScript</th></tr></thead>
      <tbody>
        <tr><td>參數</td><td><code>sys.argv[1:]</code>（記得 <code>import sys</code>）</td><td><code>argv</code>（字串陣列，不含程式名稱）</td></tr>
        <tr><td>寫 .in</td><td><code>print()</code></td><td><code>print(...)</code>（以空白分隔、自動換行；陣列會以空白連接）、<code>write(...)</code>（不換行）</td></tr>
        <tr><td>寫 .out（直接模式）</td><td><code>out.print()</code>、<code>out.write()</code></td><td><code>out.print(...)</code>、<code>out.write(...)</code></td></tr>
        <tr><td>內建函式</td><td><code>from gen import *</code>（也已預先匯入）</td><td>全域函式，或透過 <code>gen.rand_int</code> 等</td></tr>
      </tbody>
    </table>
    <p><strong>亂數種子</strong>：預設由「生成器名稱 + 參數」雜湊得出，所以<strong>同一行參數每次產生相同結果</strong>，兩行完全相同的參數也會產生相同的測資。想要多筆同規模的測資，可以多加一個用來區分的參數（例如 <code>gen 100 1</code>、<code>gen 100 2</code>），或寫 <code>seed=數字</code> 指定種子。內建函式、Python 的 <code>random</code> 模組和 JS 的 <code>Math.random</code> 都使用這個種子。</p>
    <pre>{`# Python 生成器
import sys
from gen import *

n = int(sys.argv[1])
print(n)
print_array(rand_array(n, 1, 10**9))`}</pre>
    <pre>{`// JavaScript 生成器
const n = Number(argv[0]);
print(n);
print(rand_array(n, 1, 1e9));`}</pre>

    <h3>標準解答與額外解答</h3>
    <p>從標準輸入讀取 <code>.in</code>，輸出到標準輸出。Python 可正常使用 <code>input()</code>、<code>sys.stdin</code>；JavaScript 使用 <code>readline()</code>（讀一行，讀完回傳 <code>null</code>）與 <code>readAll()</code>（讀取剩下的全部內容），以 <code>print()</code> 輸出。</p>
    <p>JavaScript 的 <code>console.log()</code> 不會寫進輸出，而是顯示在測資預覽的「除錯輸出」中；Python 寫到 <code>sys.stderr</code> 的內容也一樣。</p>

    <h3>格式驗證器</h3>
    <p>從標準輸入讀取 <code>.in</code>。若測資屬於子任務，會以子任務名稱作為參數（Python <code>sys.argv[1]</code>、JS <code>argv[0]</code>）；一筆測資屬於多個子任務時（例如透過 <code>@include</code>），會對每個子任務各執行一次。</p>
    <p>正常結束即為通過；拋出例外、<code>ensure()</code> 失敗或以非零結束碼結束即為失敗。建議使用嚴格讀取函式（<code>read_int</code>、<code>read_space</code>、<code>read_eoln</code>、<code>read_eof</code>…），它們不會略過任何空白，能檢查出多餘的空白或換行。</p>
    <pre>{`import sys
from gen import *

limit = 10 if sys.argv[1:] == ["small"] else 200000
n = read_int(1, limit)
read_eoln()
a = read_ints(n, 1, 10**9)   # 以單一空白分隔
read_eoln()
read_eof()`}</pre>

    <h3>checker</h3>
    <p>可取得三個字串：<code>input_data</code>（輸入）、<code>output_data</code>（待測輸出）、<code>answer_data</code>（標準輸出）。呼叫 <code>accept(訊息)</code> 判定正確、<code>wrong(訊息)</code> 判定錯誤；程式正常結束而沒有呼叫兩者時視為正確，執行錯誤則視為 checker 失敗。</p>
    <pre>{`from gen import *

got, exp = tokens(output_data), tokens(answer_data)
if len(got) != 1 or not float_equal(got[0], exp[0], 1e-6):
    wrong(f"預期 {exp[0]}")
accept()`}</pre>
    <p><strong>內建 checker</strong>（未提供 checker 時使用）：忽略行尾空白與檔尾空行，逐 token 比對。</p>

    <h2 id="doc-plan">參數表</h2>
    <p>三種格式擇一，在上方「參數表格式」選擇。無論哪一種，測資都依出現順序連號輸出為 <code>1.in</code>、<code>2.in</code>…。</p>

    <h3>TPS 格式</h3>
    <p>參考 IOI 的 TPS <code>gen/data</code>。每行一筆測資，<code>#</code> 之後為註解：</p>
    <pre>{`@subtask samples
manual sample1.in

@subtask small
@include samples
gen_random 10 1 100
gen_random 10 1 100 seed=42
gen_tree 10 line

@subtask full
@include small
gen_random 200000 1 1000000000`}</pre>
    <ul>
      <li><code>@subtask 名稱</code>：開始一個子任務，之後的測資都屬於它。</li>
      <li><code>@include 名稱…</code>：把其他子任務的測資也算進目前的子任務（只影響驗證器與 <code>subtasks.json</code>，不會重複產生檔案）。</li>
      <li><code>manual 檔名</code>：引用手生測資。</li>
      <li><code>生成器名稱 參數…</code>：執行生成器；<code>seed=值</code> 會被取出作為種子，不會傳給生成器。參數不能包含空白。</li>
    </ul>

    <h3>FreeMarker 子集</h3>
    <p>參考 Polygon 的 FreeMarker 腳本，只支援常用的部分。展開後的文字會再以 TPS 格式解析，所以也能使用 <code>@subtask</code> 等指令。</p>
    <pre>{`<#assign maxN = 100000>
@subtask small
<#list 1..5 as i>
gen_random \${i * 10} \${i}
</#list>

@subtask large
<#list [1000, 50000, maxN] as n>
gen_random \${n} 1
</#list>
<#if maxN gt 1000>
gen_special \${maxN}
</#if>`}</pre>
    <ul>
      <li><code>&lt;#assign 變數 = 運算式&gt;</code></li>
      <li><code>&lt;#list 序列 as 變數&gt; … &lt;/#list&gt;</code>：序列可以是 <code>a..b</code>（含兩端）、<code>a..&lt;b</code>（不含 b）或 <code>[x, y, z]</code>。</li>
      <li><code>&lt;#if 條件&gt; … &lt;#elseif 條件&gt; … &lt;#else&gt; … &lt;/#if&gt;</code></li>
      <li><code>{'${運算式}'}</code>：支援整數、字串、<code>+ - * / %</code>、比較與 <code>&& || !</code>。</li>
      <li>標籤內的 <code>&gt;</code> 會結束標籤，大於請寫 <code>gt</code>（另有 <code>gte</code>、<code>lt</code>、<code>lte</code>）或加括號。</li>
      <li><code>/</code> 會得到小數，需要整數時用 <code>?int</code>、<code>?floor</code>、<code>?ceiling</code>、<code>?round</code>，例如 <code>{'${(n / 2)?int}'}</code>。</li>
      <li><code>&lt;#-- 註解 --&gt;</code></li>
    </ul>

    <h3>Python / JavaScript 腳本</h3>
    <p>參數表本身是一段程式，透過以下函式宣告測資：</p>
    <ul>
      <li><code>subtask(名稱)</code>、<code>include(名稱, …)</code>、<code>manual(檔名)</code></li>
      <li><code>test(生成器名稱, 參數…)</code>；指定種子：Python <code>test("gen", 10, seed=5)</code>，JS <code>test("gen", 10, {'{ seed: 5 }'})</code></li>
    </ul>
    <pre>{`subtask("small")
for n in [10, 100, 1000]:
    test("gen_random", n, 1, 100)

subtask("large")
include("small")
test("gen_random", 200000, 1, 10**9, seed=1)`}</pre>

    <h2 id="doc-lib">內建函式庫</h2>
    <p>Python 與 JavaScript 提供相同的函式（Python 以關鍵字參數、JS 以最後一個物件參數傳遞選項）。所有亂數都使用參數表決定的種子。節點編號皆從 1 開始。</p>
    <table class="api">
      <tbody>
        <tr><th colspan="2">亂數</th></tr>
        <tr><td><code>rand_int(lo, hi)</code></td><td>[lo, hi] 中的隨機整數（JS 限 2<sup>53</sup> 以內）</td></tr>
        <tr><td><code>rand_float(lo, hi)</code></td><td>[lo, hi) 中的隨機浮點數</td></tr>
        <tr><td><code>choice(seq)</code>、<code>sample(seq, k)</code></td><td>隨機取一個 / 取 k 個不重複的元素</td></tr>
        <tr><td><code>shuffle(seq)</code></td><td>原地打亂並回傳</td></tr>
        <tr><td><code>rand_array(n, lo, hi)</code></td><td>n 個 [lo, hi] 中的隨機整數</td></tr>
        <tr><td><code>distinct_array(n, lo, hi)</code></td><td>n 個 [lo, hi] 中互不相同的隨機整數</td></tr>
        <tr><td><code>permutation(n)</code></td><td>1…n 的隨機排列</td></tr>
        <tr><td><code>rand_string(n, alphabet)</code></td><td>長度 n 的隨機字串（預設小寫英文字母）</td></tr>
        <tr><td><code>rand_partition(total, k)</code></td><td>把 total 隨機拆成 k 個正整數</td></tr>
        <tr><th colspan="2">圖與樹</th></tr>
        <tr><td><code>rand_tree(n, type)</code></td><td>回傳 n−1 條邊 <code>[父, 子]</code>，父節點編號一定比較小。type：<code>random</code>、<code>line</code>、<code>star</code>、<code>binary</code>、<code>caterpillar</code></td></tr>
        <tr><td><code>relabel(edges, n)</code></td><td>隨機重新編號節點並打亂邊的順序</td></tr>
        <tr><td><code>rand_graph(n, m, connected, simple, directed)</code></td><td>m 條邊的隨機圖；預設為簡單、無向、不保證連通。JS：<code>rand_graph(n, m, {'{ connected: true }'})</code></td></tr>
        <tr><td><code>rand_weights(edges, lo, hi)</code></td><td>為每條邊加上 [lo, hi] 的隨機權重 <code>[u, v, w]</code></td></tr>
        <tr><th colspan="2">輸出輔助</th></tr>
        <tr><td><code>print_array(arr, sep)</code></td><td>印出一行，以 sep（預設空白）分隔</td></tr>
        <tr><td><code>print_edges(edges)</code>、<code>print_matrix(mat)</code></td><td>每條邊 / 每列印一行</td></tr>
        <tr><th colspan="2">驗證器輔助（嚴格讀取）</th></tr>
        <tr><td><code>read_int(lo, hi)</code></td><td>讀一個整數並檢查範圍（不允許前導零、<code>-0</code>）</td></tr>
        <tr><td><code>read_ints(n, lo, hi)</code></td><td>讀 n 個以單一空白分隔的整數</td></tr>
        <tr><td><code>read_token()</code>、<code>read_line()</code></td><td>讀一個不含空白的 token / 讀到換行為止（會吃掉換行）</td></tr>
        <tr><td><code>read_space()</code>、<code>read_eoln()</code>、<code>read_eof()</code></td><td>要求剛好是一個空白 / 換行 / 檔案結尾</td></tr>
        <tr><td><code>ensure(cond, msg)</code></td><td>條件不成立時驗證失敗</td></tr>
        <tr><th colspan="2">checker 輔助</th></tr>
        <tr><td><code>accept(msg)</code>、<code>wrong(msg)</code></td><td>判定正確 / 錯誤並結束</td></tr>
        <tr><td><code>tokens(text)</code></td><td>以空白切開字串</td></tr>
        <tr><td><code>float_equal(a, b, eps)</code></td><td>|a − b| ≤ eps × max(1, |b|)，預設 eps = 1e-6</td></tr>
      </tbody>
    </table>

    <h2 id="doc-run">執行與錯誤</h2>
    <ul>
      <li>所有程式在 Web Worker 中執行，不會卡住頁面。每次執行都有逾時上限（預設 10 秒，可在上方設定），超過會強制終止並標記為 TLE。執行 Python 時若逾時或按下停止，下一次執行需要重新載入 Python 環境。</li>
      <li>任何一筆測資的生成、驗證或標準解答失敗，該筆會標紅並顯示錯誤訊息，修正前<strong>無法下載測資</strong>。</li>
      <li>按「停止」可隨時中止整批執行。</li>
      <li>點選結果表中的測資可以預覽 <code>.in</code> / <code>.out</code>（過大的檔案只顯示開頭）。</li>
      <li>測試額外解答時，結果表會依子任務彙總最差的結果，並以小方格顯示每筆測資的結果（滑鼠移上去可看到詳細資訊）。與預期不符的解答會以紅色標示。執行時間僅供參考。</li>
      <li>額外解答的預期結果：AC 表示每筆都要正確；WA / TLE / RE 表示至少一筆出現該結果；「任意」表示不檢查。</li>
    </ul>

    <h2 id="doc-save">儲存與下載</h2>
    <ul>
      <li>專案（程式碼、參數表、手生測資、設定）會自動儲存在瀏覽器的 localStorage，重新開啟網頁會自動還原。產生出的測資不會儲存，需要時重新產生即可。</li>
      <li>localStorage 容量有限（約 5MB），手生測資很大時可能無法自動儲存，請用「⤓ 下載專案」備份成 zip，之後可用「⤒ 上傳專案」還原。</li>
      <li>測資 zip 內容：<code>1.in</code>、<code>1.out</code>、<code>2.in</code>…，以及記錄子任務包含哪些測資編號的 <code>subtasks.json</code>。checker 不包含在測資 zip 中，請用「⤓ 下載 checker」另外下載。</li>
    </ul>

    <h2 id="doc-cpp">C++（實驗性功能）</h2>
    <p>C++ 程式會在瀏覽器中用 WebAssembly 版的 clang 編譯後執行。第一次執行 C++ 時需要從 CDN 下載約 18 MB 的編譯器（之後由瀏覽器快取）。編譯參數為 <code>-std=c++20 -O2 -fno-exceptions</code>；一般程式約需 2 秒，使用 testlib 的程式約需 5 秒。同一份程式碼只會編譯一次。</p>
    <p>建議使用桌面瀏覽器：編譯時需要數百 MB 記憶體，在手機上可能會失敗。</p>

    <h3>程式介面（testlib 慣例）</h3>
    <table>
      <thead><tr><th>角色</th><th>介面</th></tr></thead>
      <tbody>
        <tr><td>生成器</td><td>參數由 <code>argv</code> 取得（可用 testlib 的 <code>registerGen(argc, argv, 1)</code>、<code>opt&lt;int&gt;(1)</code>、<code>rnd</code>），輸出到 stdout 即為 <code>.in</code>。testlib 依全部參數決定種子；參數表中的 <code>seed=值</code> 會以 <code>seed=值</code> 附加為最後一個參數。直接生成輸入輸出模式下，把 <code>.out</code> 寫到檔案 <code>answer.out</code>。</td></tr>
        <tr><td>解答</td><td>從 stdin 讀、寫到 stdout。</td></tr>
        <tr><td>格式驗證器</td><td>從 stdin 讀；屬於子任務時會傳入 <code>--group 子任務名稱</code>，可用 testlib 的 <code>validator.group()</code> 取得。結束碼 0 為通過。</td></tr>
        <tr><td>checker</td><td>以 <code>checker input output answer</code> 的形式取得三個檔案（testlib 的 <code>registerTestlibCmd</code>）。結束碼 0 = AC、1 = WA、2 = PE，其他 = checker 失敗。</td></tr>
      </tbody>
    </table>
    <pre>{`#include "testlib.h"
#include <iostream>

int main(int argc, char* argv[]) {
    registerGen(argc, argv, 1);
    int n = opt<int>(1);
    std::cout << n << "
";
    for (int i = 0; i < n; i++) std::cout << rnd.next(1, 100) << " 
"[i == n - 1];
}`}</pre>

    <h3>內建標頭檔</h3>
    <ul>
      <li><code>#include &lt;bits/stdc++.h&gt;</code>：可以使用（內建替代檔）。</li>
      <li><code>#include "testlib.h"</code>：內建修改過的版本，把需要 C++ 例外的部分改寫成不需要例外的寫法，行為與原版相同。下載 checker 到評測端使用時，請搭配原版 testlib.h。</li>
    </ul>

    <h3>已知限制</h3>
    <ul>
      <li><strong>不能使用 C++ 例外</strong>：程式中不能寫 <code>try</code> / <code>throw</code>，標準函式庫的錯誤（例如 <code>std::stoi</code> 失敗）會直接中止程式。</li>
      <li><strong>遞迴深度約 5,000 層</strong>：受瀏覽器限制，無法調整。遞迴太深時程式會當掉（標示為執行錯誤），但在評測機上可能是正常的。對大測資請使用非遞迴的寫法。</li>
      <li><strong><code>long</code> 是 32 位元</strong>：指標與 <code>long</code> 都是 4 bytes，<code>long</code> 存超過 2<sup>31</sup> 的數會溢位，在評測機上卻可能正常。請改用 <code>long long</code>（<code>__int128</code> 也可以使用）。</li>
      <li>執行時間比原生慢，僅供參考。</li>
    </ul>

    <h2 id="doc-quick">簡單測試</h2>
    <p>上方導覽列的「簡單測試」頁面可以直接執行一段程式：選擇語言（C++ / Python / JavaScript）、貼上程式碼、填入輸入（stdin），按「▶ 執行」（或 Ctrl + Enter）就能看到輸出。</p>
    <ul>
      <li>可以填入命令列參數（以空白分隔），也可以上傳檔案作為輸入。</li>
      <li>「從專案載入程式」會把專案中的程式複製到編輯器；「從專案載入輸入」可以選擇手生測資或已產生的測資。修改複本不會影響專案。</li>
      <li>程式以「解答」的介面執行；Python / JS 可以使用內建函式庫，亂數種子固定為 0。逾時設定與工作區相同。</li>
      <li>輸出可以複製或下載；執行錯誤、編譯錯誤會顯示在「訊息」分頁。</li>
      <li>簡單測試的內容會自動儲存在瀏覽器中，與專案分開，不會包含在專案 zip 裡。</li>
      <li>工作區正在產生測資時無法執行，請等待完成或先停止。</li>
    </ul>
  </article>
</div>

<style>
  .docs {
    display: grid;
    grid-template-columns: 180px minmax(0, 860px);
    gap: 24px;
    padding: 16px;
    justify-content: center;
    overflow: auto;
    flex: 1;
  }
  .toc {
    position: sticky;
    top: 0;
    align-self: start;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 13px;
  }
  .toc strong { margin-bottom: 6px; }
  .toc button { text-align: left; border: none; background: none; color: var(--muted); padding: 4px 8px; }
  .toc button:hover { color: var(--text); }
  .inline { border: none; background: none; color: var(--accent); padding: 0; font-size: inherit; text-decoration: underline; }
  article { line-height: 1.7; padding-bottom: 80px; }
  h1 { font-size: 24px; margin-top: 0; }
  h2 { font-size: 19px; margin-top: 36px; padding-top: 8px; border-top: 1px solid var(--border); scroll-margin-top: 12px; }
  h3 { font-size: 15px; margin-top: 22px; }
  code { font-family: var(--mono); font-size: 0.92em; background: var(--surface-2); padding: 1px 4px; border-radius: 4px; }
  pre {
    font-family: var(--mono);
    font-size: 13px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    overflow-x: auto;
    line-height: 1.5;
  }
  table { border-collapse: collapse; width: 100%; font-size: 13px; margin: 8px 0; }
  th, td { border: 1px solid var(--border); padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: var(--surface-2); }
  .api td:first-child { white-space: nowrap; }
  dt { font-weight: 600; margin-top: 8px; }
  dd { margin-left: 16px; }
  @media (max-width: 800px) {
    .docs { grid-template-columns: minmax(0, 1fr); }
    .docs table { display: block; overflow-x: auto; }
    .toc { position: static; flex-direction: row; flex-wrap: wrap; }
    .api td:first-child { white-space: normal; }
  }
</style>
