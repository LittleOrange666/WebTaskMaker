// 產生內建的 testlib.h：把需要 C++ 例外的部分改寫，讓它能以 -fno-exceptions 編譯（spec §14.2）
// 用法：node scripts/patch-testlib.mjs <原版 testlib.h> [輸出路徑]
// 原版：https://github.com/MikeMirzayanov/testlib/blob/master/testlib.h
import fs from 'node:fs';

const [input, output = 'src/runtime/cpp/testlib.h'] = process.argv.slice(2);
if (!input) {
  console.error('用法：node scripts/patch-testlib.mjs <原版 testlib.h> [輸出路徑]');
  process.exit(1);
}

let s = fs.readFileSync(input, 'utf8').replace(/\r\n/g, '\n');
let n = 0;

// 1、2. std::stoll / std::stoull 的 try/catch 改為 strtoll / strtoull + errno 檢查
s = s.replace(
  /try \{\n(\s*)result = std::(stoll|stoull)\(buffer\);\n\s*\} catch \(const std::exception&\) \{\n(\s*in\.quit\([^\n]*\);)\n\s*\} catch \(\.\.\.\) \{\n[^\n]*\n\s*\}/g,
  (m, ind, fn, quit) => {
    n++;
    const f = fn === 'stoll' ? 'strtoll' : 'strtoull';
    return `{\n${ind}char* __end = nullptr;\n${ind}errno = 0;\n${ind}result = std::${f}(buffer, &__end, 10);\n${ind}if (errno != 0 || __end == buffer || *__end != 0)\n${quit}\n    }`;
  },
);

// 3. throw 改為 abort（生成器、驗證器、checker 都不會用到這個函式）
s = s.replace('throw "Unexpected verdict";', () => { n++; return 'std::abort();'; });

if (n !== 3) {
  console.error(`預期修改 3 處，實際 ${n} 處；testlib.h 的版本可能不同，請檢查 scripts/patch-testlib.mjs`);
  process.exit(1);
}
if (/\btry\s*\{|\bcatch\s*\(/.test(s)) {
  console.error('修改後仍有 try/catch，請檢查');
  process.exit(1);
}

s = s.replace('#include <cstdio>', '#include <cstdio>\n#include <cerrno>');

// 授權條款要求：修改後的版本需在版權聲明旁註明已修改
const notice = ` * MODIFIED by WebTaskMaker: the try/catch blocks around std::stoll /
 * std::stoull were replaced with strtoll / strtoull + errno checks, and a
 * throw statement was replaced with std::abort(), so that this file compiles
 * with -fno-exceptions (C++ exceptions are unavailable in the in-browser
 * WebAssembly toolchain). See scripts/patch-testlib.mjs.
 *
`;
const anchor = ' * Permission to modify the code and to distribute modified code is granted,';
if (!s.includes(anchor)) {
  console.error('找不到授權條款的位置，無法加上修改聲明');
  process.exit(1);
}
s = s.replace(' * Mike Mirzayanov\n', ` * Mike Mirzayanov\n *\n${notice.replace(/\n \*\n$/, '\n')}`);

fs.writeFileSync(output, s);
console.log(`已寫入 ${output}（修改 ${n} 處）`);
