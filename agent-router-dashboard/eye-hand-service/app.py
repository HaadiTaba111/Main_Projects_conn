#!/usr/bin/env python3
"""Eye (log-first) & Hand (shortcut-first) local service for Ubuntu 22.04.
No third-party Python deps. Eye reads page log files; Hand uses xdotool.
Run: DISPLAY=:0 python3 app.py   ->  http://127.0.0.1:8765
"""
import json, os, re, shutil, subprocess, time, html as htmlmod, urllib.request, resource
from collections import deque
LOG=deque(maxlen=500)
def slog(msg): LOG.append({'time': time.strftime('%H:%M:%S'), 'msg': str(msg)[:500]})
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, quote

HOST, PORT = os.getenv("EH_HOST","127.0.0.1"), int(os.getenv("EH_PORT","8765"))
ALLOWED_ROOTS = [Path(x).expanduser() for x in os.getenv("EH_LOG_ROOTS","/tmp:~/page-logs:/var/log").split(":")]
KEY_RE = re.compile(r"^[A-Za-z0-9_+.\-]+$")
STOPPED = {"on": False}   # Emergency Stop flag — hand refuses everything while on

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
        slog(f"{self.command} {self.path} -> {code}")
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
                                    "display": os.getenv("DISPLAY"), "xdotool": shutil.which("xdotool"), "emergency_stopped": STOPPED["on"]})
        if u.path == "/logs":
            return self._send(200, {"ok": True, "logs": list(LOG)[-min(int(q.get("lines",["100"])[0]),500):]})
        if u.path == "/resources":
            def cpu():
                a=[int(x) for x in Path("/proc/stat").read_text().splitlines()[0].split()[1:]]; time.sleep(.1)
                b=[int(x) for x in Path("/proc/stat").read_text().splitlines()[0].split()[1:]]
                idle=b[3]-a[3]; tot=sum(b)-sum(a); return round(100*(1-idle/max(tot,1)),1)
            mem={}
            for ln in Path("/proc/meminfo").read_text().splitlines():
                k,v=ln.split(":"); mem[k]=int(v.split()[0])*1024
            total, avail = mem.get("MemTotal",0), mem.get("MemAvailable",0)
            d=shutil.disk_usage("/")
            return self._send(200, {"ok":True,"cpu_percent":cpu(),"ram_total":total,"ram_used":total-avail,
                "ram_percent":round(100*(total-avail)/max(total,1),1),"disk_percent":round(100*d.used/max(d.total,1),1),
                "load":list(os.getloadavg()),"uptime_sec":float(Path("/proc/uptime").read_text().split()[0]),
                "process_rss_mb":round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,1),
                "cgroup_memory_max":(lambda: (Path("/sys/fs/cgroup/memory.max").read_text().strip() if Path("/sys/fs/cgroup/memory.max").exists() else "نامشخص"))()})
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
        if u.path == "/emergency/stop":
            STOPPED["on"] = True; return self._send(200, {"ok": True, "emergency_stopped": True})
        if u.path == "/emergency/resume":
            STOPPED["on"] = False; return self._send(200, {"ok": True, "emergency_stopped": False})
        if STOPPED["on"] and u.path.startswith("/hand/"):
            return self._send(423, {"detail": "🛑 EMERGENCY STOP فعال است — اول Resume کنید"})
        if u.path == "/hand/shortcut":
            keys = str(b.get("keys","")).strip()
            if not keys or not KEY_RE.match(keys): return self._send(400, {"detail": "کلید نامعتبر است؛ مثال: ctrl+l"})
            return self._send(200, run_xdo(["key","--clearmodifiers",keys]))
        if u.path == "/hand/type":
            return self._send(200, run_xdo(["type","--clearmodifiers","--",str(b.get("text",""))]))
        if u.path == "/hand/mouse":
            x, y, action = int(b.get("x",0)), int(b.get("y",0)), str(b.get("action","move"))
            args = ["mousemove", str(x), str(y)]
            out = [run_xdo(args)]
            if action in ("click","double","right"):
                btn = "3" if action=="right" else "1"
                out.append(run_xdo(["click", btn]))
                if action=="double": out.append(run_xdo(["click", btn]))
            return self._send(200, {"ok": True, "results": out})
        if u.path == "/search":
            q = str(b.get("query","")).strip(); count = min(int(b.get("count",5)), 10)
            if not q: return self._send(400, {"detail": "query خالی است"})
            try:
                req = urllib.request.Request("https://lite.duckduckgo.com/lite/?q="+quote(q),
                                             headers={"User-Agent":"Mozilla/5.0"})
                doc = urllib.request.urlopen(req, timeout=15).read().decode("utf-8","replace")
                rows = re.findall(r'<a[^>]+href="([^"]+)"[^>]*class=.result-link.>(.*?)</a>', doc, re.S)
                snips = re.findall(r'class=.result-snippet.>(.*?)</td>', doc, re.S)
                clean = lambda t: re.sub(r"<[^>]+>","",htmlmod.unescape(t)).strip()
                results = [{"title": clean(t), "url": htmlmod.unescape(u),
                            "snippet": clean(snips[i]) if i < len(snips) else ""}
                           for i,(u,t) in enumerate(rows[:count])]
                return self._send(200, {"ok": True, "query": q, "results": results})
            except Exception as e:
                return self._send(502, {"detail": f"جستجو ناموفق: {e}"})
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
    slog("service started"); print(f"Eye&Hand on http://{HOST}:{PORT}  mode={'real' if xdotool_mode() else 'simulated'}")
    ThreadingHTTPServer((HOST, PORT), H).serve_forever()
