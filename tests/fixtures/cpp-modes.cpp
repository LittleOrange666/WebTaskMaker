// tests/cpp.test.js 使用的測試程式；重新產生 cpp-modes.wasm：
//   clang++ -std=c++20 -O2 -fno-exceptions -Wl,-z,stack-size=67108864 cpp-modes.cpp -o cpp-modes.wasm
// （使用 @yowasp/clang，與網頁相同的編譯器與參數）
#include <cstdio>
#include <cstdlib>
#include <cstring>

static int depth(int d, int n) { volatile int pad[4]; pad[0] = d; return d == n ? 0 : 1 + depth(d + 1, n) + pad[0] * 0; }

static long long readAll(const char* path) {
    FILE* f = fopen(path, "r");
    if (!f) return -1;
    long long x = -1;
    if (fscanf(f, "%lld", &x) != 1) x = -2;
    fclose(f);
    return x;
}

int main(int argc, char** argv) {
    const char* mode = argc > 1 ? argv[1] : "echo";
    if (!strcmp(mode, "echo")) {               // stdin 加總，輸出 argc
        long long s = 0, x;
        while (scanf("%lld", &x) == 1) s += x;
        printf("%lld %d\n", s, argc);
    } else if (!strcmp(mode, "big")) {         // 大量輸出
        int n = atoi(argv[2]);
        for (int i = 0; i < n; i++) printf("%d\n", i);
    } else if (!strcmp(mode, "answer")) {      // 直接生成輸入輸出：寫 answer.out
        printf("in\n");
        FILE* f = fopen("answer.out", "w");
        if (!f) { fprintf(stderr, "cannot open answer.out\n"); return 5; }
        fprintf(f, "ans %s\n", argv[2]);
        fclose(f);
    } else if (!strcmp(mode, "exit")) {
        fprintf(stderr, "bye");
        return atoi(argv[2]);
    } else if (!strcmp(mode, "depth")) {
        printf("%d\n", depth(0, atoi(argv[2])));
    } else if (!strcmp(mode, "abort")) {
        abort();
    } else {                                   // checker：argv = input output answer
        long long out = readAll(argv[2]), ans = readAll(argv[3]);
        if (out == -2) { fprintf(stderr, "bad format"); return 2; }
        if (out != ans) { fprintf(stderr, "expected %lld, found %lld", ans, out); return 1; }
        fprintf(stderr, "ok %lld", out);
        return 0;
    }
}
