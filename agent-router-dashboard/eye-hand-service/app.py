#!/usr/bin/env python3
"""Eye (log-first) & Hand (shortcut-first) local service for Ubuntu 22.04.
No third-party Python deps. Eye reads page log files; Hand uses xdotool.
Run: DISPLAY=:0 python3 app.py   ->  http://127.0.0.1:8765
"""
import json, os, re, shutil, subprocess, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

HOST, PORT = os.getenv("EH_HOST","127.0.0.1"), int(os.getenv("EH_PORT","8765"))
ALLOWED_ROOTS = [Path(x).expanduser() for x in os.getenv("EH_LOG_ROOTS","/tmp:~/page-logs:/var/log").split(":")]
KEY_RE = re.compile(r"^[A-Za-z0-9_+.\-]+$")

def xdotool_mode():
    return bool(shutil.which("xdotool") and os.getenv("DISPLAY"))
def run_xdo(args):
    if not xdotool_mode():
        return {"ok": True, "simulated": True, "ran": ["xdotool"]+args}
    env = {**os.environ, "DISPLAY": os.getenv("DISPLAY", ":0")}
    r = subprocess.run(["xdotool"]+args, capture_output=True, text=True, timeout=10, env=env)
    return {"ok": r.returncode==0, "simulated": False, "ran": ["xdotool"]+args, "stderr": r.stderr.strip()}

class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Headers","Content-Type")
        self.send_header("Access-Control-Allow-Methods","GET,POST,OPTIONS")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self): self._send(200, {"ok": True})
    def _body(self):
        try: return json.loads(self.rfile.read(int(self.headers.get("Content-Length",0) or 0)) or b"{}")
        except Exception: return {}
    def do_GET(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        if u.path == "/health":
            return self._send(200, {"ok": True, "mode": "real (xdotool)" if xdotool_mode() else "simulated",
                                    "display": os.getenv("DISPLAY"), "xdotool": shutil.which("xdotool")})
        if u.path == "/eye/log":
            raw = q.get("path", ["/tmp/page.log"])[0]; lines = min(int(q.get("lines",["300"])[0]), 2000)
            p = Path(raw).expanduser()
            if not any(str(p.resolve()).startswith(str(r.resolve())) for r in ALLOWED_ROOTS):
                return self._send(403, {"detail": f"path خارج از ریشه‌های مجاز است: {ALLOWED_ROOTS}"})
            if not p.exists(): return self._send(404, {"detail": f"فایل لاگ پیدا نشد: {p}"})
            content = "\n".join(p.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:])
            return self._send(200, {"ok": True, "path": str(p), "bytes": len(content.encode()), "content": content})
        return self._send(404, {"detail": "not found"})
    def do_POST(self):
        u = urlparse(self.path); b = self._body()
        if u.path == "/hand/shortcut":
            keys = str(b.get("keys","")).strip()
            if not keys or not KEY_RE.match(keys): return self._send(400, {"detail": "کلید نامعتبر است؛ مثال: ctrl+l"})
            return self._send(200, run_xdo(["key","--clearmodifiers",keys]))
        if u.path == "/hand/type":
            return self._send(200, run_xdo(["type","--clearmodifiers","--",str(b.get("text",""))]))
        if u.path == "/hand/macro":
            out=[]
            for st in b.get("steps",[])[:50]:
                t, v = st.get("type"), str(st.get("value",""))
                if t=="key": out.append(run_xdo(["key","--clearmodifiers",v]) if KEY_RE.match(v) else {"ok":False,"step":st})
                elif t=="type": out.append(run_xdo(["type","--clearmodifiers","--",v]))
                elif t=="sleep": time.sleep(min(int(v or 0),5000)/1000); out.append({"ok":True,"step":st})
                else: out.append({"ok":False,"step":st})
            return self._send(200, {"ok": True, "results": out})
        return self._send(404, {"detail": "not found"})
    def log_message(self, *a): pass

if __name__ == "__main__":
    print(f"Eye&Hand on http://{HOST}:{PORT}  mode={'real' if xdotool_mode() else 'simulated'}")
    ThreadingHTTPServer((HOST, PORT), H).serve_forever()
