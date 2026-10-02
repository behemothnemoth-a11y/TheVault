"""Canonical, isolated acceptance-test runner for The Vault."""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parent
QUICK = [
    "startup-repeat-stability.cjs",
    "current-tabs-smoke.cjs",
    "metadata-refresh-checkpoints.cjs",
]
FULL = QUICK + [
    "calendar-reliability.cjs",
    "tv-player-containment.cjs",
    "epub-open-book-reader.cjs",
    "trips-writing-v1.cjs",
    "automatic-reading-imports.cjs",
    "comic-archive-reader.cjs",
    "comics-manga-v2.cjs",
    "games-v2-regression.cjs",
    "games-handoff-acceptance.cjs",
    "music-enrichment-batching.cjs",
    "music-v1.cjs",
    "youtube-history.cjs",
    "trips-v1.cjs",
]
TEST_ROUTES = {
    "current-tabs-smoke.cjs": "#/",
    "metadata-refresh-checkpoints.cjs": "#/home",
    "comics-manga-v2.cjs": "#/manga",
    "games-v2-regression.cjs": "#/games",
    "games-handoff-acceptance.cjs": "#/games",
    "music-enrichment-batching.cjs": "#/music",
    "music-v1.cjs": "#/music",
    "youtube-history.cjs": "#/youtube",
    "trips-v1.cjs": "#/trips",
}

def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])

def find_node() -> str:
    configured = os.environ.get("VAULT_NODE")
    candidates = [configured, shutil.which("node"), str(Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe")]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate))
    raise RuntimeError("Node.js was not found. Reopen Codex once or set VAULT_NODE to node.exe.")

def wait_ready(url: str, timeout: float = 20) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("The temporary Vault test server did not start.")

def report_html(report: dict) -> str:
    rows = []
    for result in report["tests"]:
        tone = "pass" if result["passed"] else "fail"
        details = html.escape(result["output"][-4000:])
        rows.append(f'<article class="{tone}"><h2>{html.escape(result["name"])}</h2><b>{"PASSED" if result["passed"] else "FAILED"} · {result["seconds"]:.1f}s</b><pre>{details}</pre></article>')
    return f'''<!doctype html><meta charset="utf-8"><title>Vault Test Report</title><style>body{{margin:0;background:#090b08;color:#d5c79e;font:16px Consolas;padding:32px}}header,article{{max-width:1100px;margin:0 auto 16px;border:1px solid #66552d;background:#11140e;padding:18px}}h1,h2{{color:#e0aa3f}}article.pass{{border-color:#4d7438}}article.fail{{border-color:#9a4937}}pre{{white-space:pre-wrap;max-height:320px;overflow:auto;background:#050605;padding:12px}}b{{color:#a9d36c}}</style><header><h1>THE VAULT · TEST REPORT</h1><p>{report["passed"]} passed · {report["failed"]} failed · {report["seconds"]:.1f} seconds</p><p>{html.escape(report["completedAt"])}</p></header>{''.join(rows)}'''

def main() -> int:
    parser = argparse.ArgumentParser(description="Test the current Vault safely on an isolated temporary server.")
    parser.add_argument("--quick", action="store_true", help="Run the three essential checks only.")
    parser.add_argument("--timeout", type=int, default=180, help="Maximum seconds allowed per test.")
    args = parser.parse_args()
    tests = QUICK if args.quick else FULL
    node = find_node()
    port = free_port()
    origin = f"http://127.0.0.1:{port}/index.html"
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    test_state = tempfile.TemporaryDirectory(prefix="vault-audit-")
    server_env = os.environ.copy()
    server_env["VAULT_TEST_STATE_DIR"] = test_state.name
    server = subprocess.Popen([sys.executable, str(ROOT / "vault_server.py"), "--port", str(port)], cwd=ROOT, env=server_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=creationflags)
    started = time.perf_counter()
    results = []
    try:
        wait_ready(origin)
        print(f"THE VAULT - {'QUICK' if args.quick else 'FULL'} ACCEPTANCE TEST")
        print(f"Temporary isolated server: 127.0.0.1:{port}\n")
        for index, name in enumerate(tests, 1):
            path = ROOT / "tests" / name
            env = os.environ.copy()
            env["VAULT_TEST_URL"] = origin + TEST_ROUTES.get(name, "")
            env["VAULT_TEST_ROOT"] = origin + "#/"
            print(f"[{index}/{len(tests)}] {name} ... ", end="", flush=True)
            test_started = time.perf_counter()
            try:
                run = subprocess.run([node, str(path)], cwd=ROOT, env=env, capture_output=True, text=True, timeout=args.timeout)
                output = (run.stdout + "\n" + run.stderr).strip()
                passed = run.returncode == 0
            except subprocess.TimeoutExpired as error:
                output = f"Timed out after {args.timeout} seconds.\n{error.stdout or ''}\n{error.stderr or ''}"
                passed = False
            elapsed = time.perf_counter() - test_started
            results.append({"name": name, "passed": passed, "seconds": elapsed, "output": output})
            print(f"{'PASS' if passed else 'FAIL'} ({elapsed:.1f}s)")
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
    completed = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    report = {"suite": "quick" if args.quick else "full", "completedAt": completed, "seconds": time.perf_counter()-started, "passed": sum(item["passed"] for item in results), "failed": sum(not item["passed"] for item in results), "tests": results}
    reports = ROOT / "reports"
    reports.mkdir(exist_ok=True)
    (reports / "vault-test-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (reports / "vault-test-report.html").write_text(report_html(report), encoding="utf-8")
    print(f"\nRESULT: {report['passed']} PASSED - {report['failed']} FAILED")
    print(f"Readable report: {reports / 'vault-test-report.html'}")
    return 0 if report["failed"] == 0 else 1

if __name__ == "__main__":
    raise SystemExit(main())
