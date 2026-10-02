"""Regression checks for local server hardening: host allow-list, private paths, archive members, byte ranges."""
import http.client
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from vault_server import VaultHandler, cli_archive_read

def handler_for(path="/", host="127.0.0.1:4173", port=4173):
    handler = VaultHandler.__new__(VaultHandler)
    handler.directory, handler.path = str(ROOT), path
    handler.headers = {"Host": host} if host is not None else {}
    handler.server = SimpleNamespace(server_address=("127.0.0.1", port))
    return handler

class StaticGuardTests(unittest.TestCase):
    def test_private_material_is_forbidden(self):
        for path in ["/data/private/tmdb-token.json", "/DATA/Private/x.json", "/data/private", "/.env.local", "/js/../.env.local", "/backups/README.md", "/tests/edge-profile-reading-audit-20260828/Default/Login%20Data"]:
            self.assertTrue(handler_for(path).static_path_forbidden(), path)
    def test_app_paths_are_served(self):
        for path in ["/", "/index.html", "/js/app.js?v=1", "/recovery/vault-reconstruction-stage-0-repaired-2026-07-29.json", "/tests/runtime-harness.html", "/data/sample-data.js", "/assets/artwork/x.jpg"]:
            self.assertFalse(handler_for(path).static_path_forbidden(), path)
    def test_host_allow_list(self):
        for host in ["127.0.0.1:4173", "localhost:4173", "LOCALHOST:4173", "127.0.0.1", None]:
            self.assertTrue(handler_for(host=host).host_is_local(), host)
        for host in ["attacker.example", "attacker.example:4173", "127.0.0.1:9999", "127.0.0.1.attacker.example:4173", "[::1]:4173", "evil:4173@127.0.0.1"]:
            self.assertFalse(handler_for(host=host).host_is_local(), host)

@unittest.skipUnless(shutil.which("tar.exe"), "tar.exe is not available")
class ArchiveMemberTests(unittest.TestCase):
    def test_members_are_read_literally(self):
        members = {"[Scan] 001.jpg": b"A" * 11, "Vol 1/c*3.jpg": b"C" * 33, "Vol 1/cX3.jpg": b"D" * 44, "-rf.jpg": b"E" * 55, "what?.jpg": b"F" * 66, "whatX.jpg": b"G" * 77}
        with tempfile.TemporaryDirectory() as folder:
            archive = Path(folder) / "sample.cbr"
            with zipfile.ZipFile(archive, "w") as bundle:
                for name, data in members.items(): bundle.writestr(name, data)
            for name, data in members.items():
                self.assertEqual(cli_archive_read(archive, name), data, name)

class LiveServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.state = tempfile.TemporaryDirectory(prefix="vault-hardening-")
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0)); cls.port = sock.getsockname()[1]
        env = os.environ.copy(); env["VAULT_TEST_STATE_DIR"] = cls.state.name
        cls.server = subprocess.Popen([sys.executable, str(ROOT / "vault_server.py"), "--port", str(cls.port), "--no-browser"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        deadline = time.time() + 20
        while time.time() < deadline:
            try:
                if cls.request("GET", "/index.html")[0] == 200: return
            except OSError:
                pass
            time.sleep(0.2)
        cls.tearDownClass(); raise RuntimeError("The temporary Vault test server did not start.")
    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        try: cls.server.wait(timeout=5)
        except subprocess.TimeoutExpired: cls.server.kill()
        cls.state.cleanup()
    @classmethod
    def request(cls, method, path, host=None, headers=None, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", cls.port, timeout=10)
        try:
            conn.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
            conn.putheader("Host", host or f"127.0.0.1:{cls.port}")
            for key, value in (headers or {}).items(): conn.putheader(key, value)
            if body is not None: conn.putheader("Content-Length", str(len(body)))
            conn.endheaders(body)
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            conn.close()
    def test_foreign_host_is_refused(self):
        self.assertEqual(self.request("GET", "/index.html", host="attacker.example")[0], 403)
        self.assertEqual(self.request("GET", "/__vault/state/mirror", host=f"attacker.example:{self.port}")[0], 403)
        self.assertEqual(self.request("POST", "/__vault/home/weather", host="attacker.example", headers={"X-Vault-Request": "home-weather"}, body=b"{}")[0], 403)
        self.assertEqual(self.request("GET", "/index.html", host=f"localhost:{self.port}")[0], 200)
    def test_private_material_is_not_served(self):
        for path in ["/.env.local", "/data/private/vault-state-mirror.json", "/backups/README.md"]:
            self.assertEqual(self.request("GET", path)[0], 404, path)
            self.assertEqual(self.request("HEAD", path)[0], 404, path)
    def test_media_byte_ranges(self):
        media = Path(self.state.name) / "clip.mp4"
        media.write_bytes(bytes(range(256)) * 4)
        status, _, raw = self.request("POST", "/__vault/media/token", headers={"X-Vault-Request": "media-token", "Content-Type": "application/json"}, body=json.dumps({"path": str(media)}).encode())
        self.assertEqual(status, 200)
        url = next(value for value in json.loads(raw).values() if isinstance(value, str) and "media/content?token=" in value)
        path, data = "/__vault/" + url.split("__vault/", 1)[1], media.read_bytes()
        status, headers, body = self.request("GET", path, headers={"Range": "bytes=-100"})
        self.assertEqual((status, headers.get("Content-Range"), body), (206, "bytes 924-1023/1024", data[-100:]))
        status, headers, body = self.request("GET", path, headers={"Range": "bytes=10-19"})
        self.assertEqual((status, headers.get("Content-Range"), body), (206, "bytes 10-19/1024", data[10:20]))
        status, _, body = self.request("GET", path)
        self.assertEqual((status, body), (200, data))

if __name__ == '__main__': unittest.main()
