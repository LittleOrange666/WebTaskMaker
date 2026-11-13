// 可一鍵載入的範例專案（spec §9）
import { makeFile, normalizeProject } from '../lib/project.js';

const f = makeFile;

function proj(meta, files) {
  return normalizeProject({ version: 1, timeoutSec: 10, ...meta, files });
}

export const EXAMPLES = [
  {
    id: 'aplusb-py',
    title: 'A+B Problem（Python）',
    description: '最小範例：TPS 參數表、子任務、手生樣例、驗證器、一份預期 WA 的額外解答。',
    build: () => proj({ mode: 'infer', planFormat: 'tps' }, [
      f('plan', 'gen_data.txt', `# 每行一筆測資；同一行參數會產生相同結果，
# 所以要產生多筆「同規模」的測資時，多加一個不同的參數（這裡的第二個參數只用來區分）

@subtask samples
manual sample1.in

@subtask small
@include samples
gen_ab 1000 1
gen_ab 1000 2
gen_ab 1000 3

@subtask large
@include small
gen_ab 1000000000 1
gen_ab 1000000000 2
gen_ab 1000000000 3 seed=2024
`),
      f('generator', 'gen_ab.py', `import sys
from gen import *

limit = int(sys.argv[1])   # 參數表中的第一個參數
a = rand_int(-limit, limit)
b = rand_int(-limit, limit)
print(a, b)
`),
      f('solution', 'sol.py', `a, b = map(int, input().split())
print(a + b)
`),
      f('manual', 'sample1.in', '1 2\n'),
      f('manual', 'sample1.out', '3\n'),
      f('validator', 'validator.py', `import sys
from gen import *

subtask = sys.argv[1] if len(sys.argv) > 1 else ""
limit = 1000 if subtask in ("samples", "small") else 10**9

a = read_int(-limit, limit)
read_space()
b = read_int(-limit, limit)
read_eoln()
read_eof()
`),
      f('extra', 'wrong_minus.py', `a, b = map(int, input().split())
print(a - b)
`, { expected: 'WA' }),
    ]),
  },
  {
    id: 'aplusb-js',
    title: 'A+B Problem（JavaScript + FreeMarker）',
    description: '用 FreeMarker 子集的 <#list> 迴圈產生多筆測資，程式皆以 JavaScript 撰寫。',
    build: () => proj({ mode: 'infer', planFormat: 'freemarker' }, [
      f('plan', 'script.ftl', `<#-- 樣例 -->
@subtask samples
manual sample1.in

@subtask all
@include samples
<#list 1..8 as i>
gen_ab \${i * 125} \${i}
</#list>
<#assign big = 1000000000>
gen_ab \${big} 99
`),
      f('generator', 'gen_ab.js', `// argv 為參數表中的參數（字串陣列）
const limit = Number(argv[0]);
print(rand_int(-limit, limit), rand_int(-limit, limit));
`),
      f('solution', 'sol.js', `const [a, b] = readline().split(' ').map(Number);
print(a + b);
`),
      f('manual', 'sample1.in', '1 2\n'),
      f('validator', 'validator.js', `read_int(-1e9, 1e9);
read_space();
read_int(-1e9, 1e9);
read_eoln();
read_eof();
`),
    ]),
  },
  {
    id: 'tree-py',
    title: '樹的直徑（Python 腳本參數表）',
    description: '示範 rand_tree / relabel、以 Python 腳本撰寫參數表、依子任務檢查限制的驗證器。',
    build: () => proj({ mode: 'infer', planFormat: 'py' }, [
      f('plan', 'plan.py', `# 參數表也可以是一段 Python 程式
TYPES = ["random", "line", "star", "binary", "caterpillar"]

subtask("samples")
manual("sample1.in")

subtask("small")
include("samples")
for t in TYPES:
    test("gen_tree", 10, t)

subtask("large")
include("small")
for t in TYPES:
    test("gen_tree", 200000, t)
`),
      f('generator', 'gen_tree.py', `import sys
from gen import *

n = int(sys.argv[1])
kind = sys.argv[2]
edges = relabel(rand_tree(n, kind), n)   # 隨機重新編號並打亂邊的順序
print(n)
print_edges(edges)
`),
      f('solution', 'sol.py', `import sys
from collections import deque

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    adj = [[] for _ in range(n + 1)]
    for i in range(n - 1):
        u, v = int(data[1 + 2 * i]), int(data[2 + 2 * i])
        adj[u].append(v)
        adj[v].append(u)

    def bfs(s):
        dist = [-1] * (n + 1)
        dist[s] = 0
        q = deque([s])
        while q:
            x = q.popleft()
            for y in adj[x]:
                if dist[y] < 0:
                    dist[y] = dist[x] + 1
                    q.append(y)
        far = max(range(1, n + 1), key=lambda i: dist[i])
        return far, dist[far]

    a, _ = bfs(1)
    _, d = bfs(a)
    print(d)

main()
`),
      f('manual', 'sample1.in', '5\n1 2\n1 3\n3 4\n3 5\n'),
      f('validator', 'validator.py', `import sys
from gen import *

subtask = sys.argv[1] if len(sys.argv) > 1 else ""
max_n = 10 if subtask in ("samples", "small") else 200000

n = read_int(2, max_n)
read_eoln()
parent = list(range(n + 1))

def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x

for _ in range(n - 1):
    u = read_int(1, n)
    read_space()
    v = read_int(1, n)
    read_eoln()
    ru, rv = find(u), find(v)
    ensure(ru != rv, f"邊 {u} {v} 形成環，輸入不是一棵樹")
    parent[ru] = rv
read_eof()
`),
      f('extra', 'wrong_depth.py', `# 錯誤解：只算從 1 號點出發的最大深度
import sys
from collections import deque

data = sys.stdin.read().split()
n = int(data[0])
adj = [[] for _ in range(n + 1)]
for i in range(n - 1):
    u, v = int(data[1 + 2 * i]), int(data[2 + 2 * i])
    adj[u].append(v)
    adj[v].append(u)
dist = [-1] * (n + 1)
dist[1] = 0
q = deque([1])
while q:
    x = q.popleft()
    for y in adj[x]:
        if dist[y] < 0:
            dist[y] = dist[x] + 1
            q.append(y)
print(max(dist))
`, { expected: 'WA' }),
    ]),
  },
  {
    id: 'float-js',
    title: '平均數（自訂 checker，JavaScript）',
    description: '答案為浮點數，以自訂 checker 允許 1e-6 的誤差；附一份精度不足、預期 WA 的解答。',
    build: () => proj({ mode: 'infer', planFormat: 'tps' }, [
      f('plan', 'gen_data.txt', `gen_avg 1 1
gen_avg 10 1
gen_avg 10 2
gen_avg 1000 1
gen_avg 100000 1
`),
      f('generator', 'gen_avg.js', `const n = Number(argv[0]);
print(n);
print(rand_array(n, 1, 1000));
`),
      f('solution', 'sol.js', `readline();
const a = readline().split(' ').map(Number);
print((a.reduce((x, y) => x + y, 0) / a.length).toFixed(10));
`),
      f('checker', 'checker.js', `// input_data / output_data / answer_data：輸入、待測輸出、標準輸出
const got = tokens(output_data);
const exp = tokens(answer_data);
if (got.length !== 1) wrong('輸出應該剛好一個數字');
if (!float_equal(got[0], exp[0], 1e-6)) wrong(\`預期 \${exp[0]}，得到 \${got[0]}\`);
accept();
`),
      f('extra', 'low_precision.js', `readline();
const a = readline().split(' ').map(Number);
print((a.reduce((x, y) => x + y, 0) / a.length).toFixed(1));
`, { expected: 'WA' }),
    ]),
  },
  {
    id: 'direct-py',
    title: '質因數分解（直接生成輸入輸出）',
    description: '先決定答案（兩個質數）再構造輸入：生成器用 out.print() 直接寫出 .out，不需要標準解答。',
    build: () => proj({ mode: 'direct', planFormat: 'tps' }, [
      f('plan', 'gen_data.txt', `@subtask small
gen_semiprime 100 1
gen_semiprime 100 2
gen_semiprime 100 3

@subtask large
gen_semiprime 1000000 1
gen_semiprime 1000000 2
gen_semiprime 1000000 3
`),
      f('generator', 'gen_semiprime.py', `import sys
from gen import *

def is_prime(x):
    if x < 2:
        return False
    i = 2
    while i * i <= x:
        if x % i == 0:
            return False
        i += 1
    return True

def rand_prime(limit):
    while True:
        x = rand_int(2, limit)
        if is_prime(x):
            return x

limit = int(sys.argv[1])
p, q = sorted([rand_prime(limit), rand_prime(limit)])
print(p * q)       # 寫入 .in
out.print(p, q)    # 寫入 .out
`),
    ]),
  },
  {
    id: 'sum-cpp',
    title: '數列總和（C++ + testlib，實驗性）',
    description: '以 testlib 撰寫生成器、驗證器（--group）與 checker，並附一份用 int 而溢位、預期 WA 的解答。第一次執行需下載約 18 MB 的編譯器。',
    build: () => proj({ mode: 'infer', planFormat: 'tps' }, [
      f('plan', 'gen_data.txt', `@subtask samples
manual sample1.in

@subtask small
@include samples
gen_sum 10 10
gen_sum 10 1000000000

@subtask large
@include small
gen_sum 200000 1000000000
gen_sum 200000 1000000000 seed=7
`),
      f('generator', 'gen_sum.cpp', `#include "testlib.h"
#include <iostream>
using namespace std;

// 參數：n 最大值
// testlib 依全部參數決定亂數種子，所以同一行參數會產生相同結果
int main(int argc, char* argv[]) {
    registerGen(argc, argv, 1);
    int n = opt<int>(1);
    int maxv = opt<int>(2);
    cout << n << "\\n";
    for (int i = 0; i < n; i++) cout << rnd.next(1, maxv) << " \\n"[i == n - 1];
}
`),
      f('solution', 'sol.cpp', `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    long long sum = 0;   // 注意：瀏覽器中 long 是 32 位元，請用 long long
    for (int i = 0; i < n; i++) {
        long long x;
        cin >> x;
        sum += x;
    }
    cout << sum << "\\n";
}
`),
      f('manual', 'sample1.in', '3\n1 2 3\n'),
      f('manual', 'sample1.out', '6\n'),
      f('validator', 'validator.cpp', `#include "testlib.h"
#include <string>
using namespace std;

// 屬於子任務時會傳入 --group <子任務名稱>，用 validator.group() 取得
int main(int argc, char* argv[]) {
    registerValidation(argc, argv);
    string g = validator.group();
    int maxn = (g == "samples" || g == "small") ? 10 : 200000;
    int n = inf.readInt(1, maxn, "n");
    inf.readEoln();
    inf.readInts(n, 1, 1000000000, "a");
    inf.readEoln();
    inf.readEof();
}
`),
      f('checker', 'checker.cpp', `#include "testlib.h"

// 以 checker <input> <output> <answer> 執行；結束碼 0 = AC、1 = WA、2 = PE
int main(int argc, char* argv[]) {
    registerTestlibCmd(argc, argv);
    long long expected = ans.readLong();
    long long found = ouf.readLong();
    if (expected != found) quitf(_wa, "expected %lld, found %lld", expected, found);
    quitf(_ok, "answer is %lld", found);
}
`),
      f('extra', 'wrong_int.cpp', `#include <bits/stdc++.h>
using namespace std;

// 錯誤解：用 int 存總和，大測資會溢位
int main() {
    int n;
    cin >> n;
    int sum = 0;
    for (int i = 0; i < n; i++) {
        int x;
        cin >> x;
        sum += x;
    }
    cout << sum << "\\n";
}
`, { expected: 'WA' }),
    ]),
  },
];

export function exampleById(id) {
  return EXAMPLES.find((e) => e.id === id) ?? EXAMPLES[0];
}
