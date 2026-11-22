#!/usr/bin/env python3
"""性能計測を複数回行い、環境が高負荷だった回（無効な測定）を除外して、有効な回だけを集計する。

  python3 tools/perf_runs.py [--game crowd-sprint-3d] [--attempts 8] [--scale 1] [--window]

各回：①Mac の負荷（ロードアベレージ）②何も描かない WebGL のベースライン（ゲーム内のベンチが測る）を確認し、
どちらかが基準を超えたら、その回は「無効」として結果に使わない。有効な回が 3 回に満たなければ「計測できなかった」と報告する。
基準：ロードアベレージ（1 分）が CPU コア数の 0.8 倍未満／ベースラインのフレーム間隔が 17.5ms 未満かつ空のクリアの GPU 時間が 1.5ms 未満。
"""
import argparse
import json
import os
import statistics
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build  # noqa: E402
import cdp  # noqa: E402
import serve  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", default="crowd-sprint-3d")
    ap.add_argument("--attempts", type=int, default=8)
    ap.add_argument("--scale", default="1")
    ap.add_argument("--window", action="store_true")
    ap.add_argument("--wait", type=int, default=20, help="無効だった回のあと、待つ秒数")
    a = ap.parse_args()
    build.build()
    srv = serve.make_server(0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    cores = os.cpu_count() or 8
    attempts = []
    for i in range(a.attempts):
        load = os.getloadavg()[0]
        url = "http://127.0.0.1:%d/%s/?bench=1&loop=1&scale=%s" % (port, a.game, a.scale)
        raw = cdp.run(url, 120, 480, 860, headless=not a.window)
        rec = {"attempt": i + 1, "load_1min": round(load, 1), "cores": cores}
        if not raw:
            rec.update(valid=False, reason="結果が出なかった")
        else:
            d = json.loads(raw)
            base = d["baseline"]
            ok_load = load < cores * 0.8
            ok_base = bool(base.get("ok")) and isinstance(base.get("gpu_clear_ms"), (int, float)) and base["gpu_clear_ms"] < 1.5 and (base.get("frame_ms") or 99) < 17.5
            rec.update(baseline=base, valid=bool(ok_load and ok_base), fps=d["fps"]["avg"], p95=d["dt_p95_ms"]["avg"], cpu_ms=d["cpu_ms"]["avg"], gpu_ms=d["gpu_ms"]["avg"] if isinstance(d["gpu_ms"], dict) else None,
                       reason=None if (ok_load and ok_base) else ("負荷が高い（ロードアベレージ %.1f）" % load if not ok_load else "ベースラインが基準外"))
        attempts.append(rec)
        print(json.dumps(rec, ensure_ascii=False))
        if not rec["valid"]:
            time.sleep(a.wait)
    valid = [r for r in attempts if r["valid"]]
    print("\n=== まとめ：有効 %d 回／%d 回" % (len(valid), len(attempts)))
    if len(valid) >= 3:
        for k in ("fps", "p95", "cpu_ms", "gpu_ms"):
            vs = [r[k] for r in valid if r.get(k) is not None]
            if vs:
                print("%s：中央値 %.2f（最小 %.2f・最大 %.2f）" % (k, statistics.median(vs), min(vs), max(vs)))
    else:
        print("有効な回が 3 回に満たないため、FPS・GPU 時間は採用しない（計測できなかった）。CPU 時間も参考値として扱う。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
