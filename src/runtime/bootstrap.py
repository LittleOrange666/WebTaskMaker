import sys
import io
import json
import builtins
import traceback
import linecache

if "/home/pyodide" not in sys.path:
    sys.path.insert(0, "/home/pyodide")

import gen  # noqa: E402

sys.setrecursionlimit(10000)


def _wtm_format_exc(exc, filename):
    tb = exc.__traceback__
    # 跳過 bootstrap 自身的堆疊，只留下使用者程式的部分
    while tb is not None and tb.tb_frame.f_code.co_filename != filename:
        tb = tb.tb_next
    lines = traceback.format_exception(type(exc), exc, tb)
    return "".join(lines).strip()


def _wtm_run(code, req_json):
    req = json.loads(req_json)
    role = req["role"]
    filename = req.get("filename") or "main.py"
    stdin_text = req.get("stdin") or ""
    # 用 BytesIO 包裝，讓 sys.stdin.buffer / sys.stdout.buffer 也能使用
    out_bytes = io.BytesIO()
    out_buf = io.TextIOWrapper(out_bytes, encoding="utf-8", newline="\n", write_through=True)
    err_buf = io.StringIO()
    saved = (sys.stdout, sys.stderr, sys.stdin, sys.argv)
    sys.stdout, sys.stderr = out_buf, err_buf
    sys.stdin = io.TextIOWrapper(io.BytesIO(stdin_text.encode("utf-8")), encoding="utf-8")
    sys.argv = [filename] + [str(a) for a in (req.get("argv") or [])]
    gen._reset(req.get("seed") or 0, stdin_text)

    ns = {"__name__": "__main__", "__builtins__": builtins, "__file__": filename}
    for name in gen.__all__:
        ns[name] = getattr(gen, name)
    extra = req.get("extra") or {}
    if role == "checker":
        ns["input_data"] = extra.get("input", "")
        ns["output_data"] = extra.get("output", "")
        ns["answer_data"] = extra.get("answer", "")

    plan_lines = []
    if role == "plan":
        ns["subtask"] = lambda name: plan_lines.append(f"@subtask {name}")
        ns["include"] = lambda *names: plan_lines.append("@include " + " ".join(names))
        ns["manual"] = lambda file: plan_lines.append(f"manual {file}")

        def test(gen_name, *args, seed=None):
            parts = [str(gen_name)] + [" ".join(map(str, a)) if isinstance(a, (list, tuple)) else str(a) for a in args]
            if seed is not None:
                parts.append(f"seed={seed}")
            plan_lines.append(" ".join(parts))

        ns["test"] = test

    # 讓錯誤訊息能顯示原始碼行
    linecache.cache[filename] = (len(code), None, code.splitlines(True), filename)
    res = {"status": "ok"}
    try:
        exec(compile(code, filename, "exec"), ns)
        if role == "checker":
            res["verdict"] = "AC"
    except SystemExit as e:
        if e.code not in (None, 0):
            res["status"] = "error"
            res["message"] = f"程式以結束碼 {e.code} 結束"
        elif role == "checker":
            res["verdict"] = "AC"
    except gen.CheckerResult as e:
        if role == "checker":
            res["verdict"] = e.verdict
            res["message"] = e.msg
        else:
            res["status"] = "error"
            res["message"] = "accept()/wrong() 只能在 checker 中使用"
    except gen.ValidationError as e:
        res["status"] = "error"
        res["message"] = str(e)
    except BaseException as e:  # noqa: BLE001
        res["status"] = "error"
        res["message"] = _wtm_format_exc(e, filename)
    finally:
        sys.stdout, sys.stderr, sys.stdin, sys.argv = saved

    try:
        out_buf.flush()
    except ValueError:
        pass  # 使用者關閉了 stdout
    res["stdout"] = "\n".join(plan_lines) + "\n" if role == "plan" else out_bytes.getvalue().decode("utf-8", errors="replace")
    res["out2"] = gen.out.buf.getvalue()
    res["stderr"] = err_buf.getvalue()
    return json.dumps(res)
