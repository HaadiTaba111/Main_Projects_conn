// داشبورد اجرای سیستم‌ها — بدون وابستگی npm، فقط Node.js 18+.
// فقط دستورهای داخل systems.json اجرا می‌شوند؛ هیچ دستور دلخواهی از مرورگر گرفته نمی‌شود.
import http from 'node:http';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DASH_PORT = Number(process.env.DASHBOARD_PORT || 8700);
// پیش‌فرض فقط همین دستگاه. برای دسترسی از گوشی/شبکه: HOST=0.0.0.0
const HOST = process.env.HOST || '127.0.0.1';
const IS_WIN = process.platform === 'win32';
const LOG_MAX = 300;
const KILL_GRACE_MS = 3000;

const systems = JSON.parse(await readFile(path.join(HERE, 'systems.json'), 'utf8'));
const byId = new Map(systems.map(s => [String(s.id), s]));
const state = new Map(); // id -> { proc, startedAt, log[], lastExit, job }

for (const s of systems) state.set(String(s.id), { proc: null, startedAt: 0, log: [], lastExit: null, job: null });

const expand = value => String(value).replaceAll('${HOST}', HOST);

function pythonFor(system) {
  if (process.env.PYTHON) return process.env.PYTHON;
  const dir = path.join(ROOT, system.folder);
  const venvPosix = path.join(dir, '.venv', 'bin', 'python');
  const venvWin = path.join(dir, '.venv', 'Scripts', 'python.exe');
  if (existsSync(venvPosix)) return venvPosix;
  if (existsSync(venvWin)) return venvWin;
  return IS_WIN ? 'python' : 'python3';
}

function commandFor(system) {
  if (system.command === 'node') return process.execPath;
  if (system.command === 'python') return pythonFor(system);
  throw new Error(`دستور ناشناخته: ${system.command}`);
}

// وقتی پروسس با سیگنال بسته شود exitCode برابر null می‌ماند؛ برای تشخیص زنده بودن باید signalCode هم بررسی شود.
const isAlive = child => !!child && child.exitCode === null && child.signalCode === null;

function pushLog(id, line) {
  const st = state.get(id);
  const stamp = new Date().toLocaleTimeString('fa-IR');
  for (const part of String(line).split(/\r?\n/)) {
    if (!part.trim()) continue;
    st.log.push(`[${stamp}] ${part}`);
  }
  if (st.log.length > LOG_MAX) st.log.splice(0, st.log.length - LOG_MAX);
}

function portListening(port) {
  return new Promise(resolve => {
    const sock = net.connect({ port: Number(port), host: '127.0.0.1', timeout: 400 });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.once('error', () => resolve(false));
  });
}

function spawnProcess(id, system, args, extraEnv) {
  const cmd = commandFor(system);
  const env = { ...process.env };
  for (const [k, v] of Object.entries(system.env || {})) env[k] = expand(v);
  Object.assign(env, extraEnv || {});
  const cwd = path.join(ROOT, system.folder);
  const child = spawn(cmd, args.map(expand), {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !IS_WIN, // گروه پروسس جدا تا Stop درخت پروسس‌ها را ببندد
    windowsHide: true
  });
  child.stdout.on('data', chunk => pushLog(id, chunk));
  child.stderr.on('data', chunk => pushLog(id, chunk));
  child.on('error', err => pushLog(id, `خطا در اجرا: ${err.message}`));
  return child;
}

function killTree(child) {
  if (!isAlive(child)) return;
  if (IS_WIN) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    return;
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  setTimeout(() => {
    if (isAlive(child)) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
    }
  }, KILL_GRACE_MS).unref();
}

async function startServer(id) {
  const system = byId.get(id);
  const st = state.get(id);
  if (system.kind !== 'server') throw httpError(400, 'این سیستم سرور نیست.');
  if (isAlive(st.proc)) throw httpError(409, 'این سیستم از قبل در حال اجراست.');
  if (await portListening(system.port)) {
    throw httpError(409, `پورت ${system.port} از قبل توسط یک برنامهٔ دیگر اشغال است.`);
  }
  st.log = [];
  pushLog(id, `▶ شروع ${system.name} (پورت ${system.port})`);
  st.startedAt = Date.now();
  st.lastExit = null;
  const child = spawnProcess(id, system, system.args || []);
  st.proc = child;
  child.on('exit', (code, signal) => {
    st.lastExit = { code, signal, at: Date.now() };
    pushLog(id, `■ سیستم متوقف شد (کد ${code ?? signal})`);
  });
  return { ok: true };
}

function stopServer(id) {
  const st = state.get(id);
  if (!isAlive(st.proc)) throw httpError(409, 'این سیستم در حال اجرا نیست.');
  pushLog(id, '⏹ درخواست توقف…');
  killTree(st.proc);
  return { ok: true };
}

function runAction(id, actionId) {
  const system = byId.get(id);
  const st = state.get(id);
  const action = (system.actions || []).find(a => a.id === actionId);
  if (!action) throw httpError(404, 'عملیات پیدا نشد.');
  if (st.job && st.job.running) throw httpError(409, 'یک عملیات دیگر از همین سیستم در حال اجراست.');
  st.log = [];
  pushLog(id, `▶ ${action.label}`);
  st.job = { label: action.label, running: true, code: null, startedAt: Date.now() };
  const child = spawnProcess(id, system, action.args || []);
  child.on('exit', code => {
    st.job = { ...st.job, running: false, code, endedAt: Date.now() };
    pushLog(id, code === 0 ? '✅ تمام شد (بدون خطا)' : `❌ با خطا تمام شد (کد ${code})`);
  });
  return { ok: true };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function snapshot() {
  const out = [];
  for (const system of systems) {
    const id = String(system.id);
    const st = state.get(id);
    const running = isAlive(st.proc);
    const listening = system.kind === 'server' ? await portListening(system.port) : false;
    out.push({
      id,
      name: system.name,
      description: system.description || '',
      kind: system.kind,
      folder: system.folder,
      port: system.port || null,
      running,
      listening,
      startedAt: running ? st.startedAt : null,
      lastExit: st.lastExit,
      actions: (system.actions || []).map(a => ({ id: a.id, label: a.label })),
      job: st.job
    });
  }
  return out;
}

function hostAllowed(req) {
  // جلوگیری از DNS rebinding: اگر فقط روی همین دستگاه گوش می‌دهیم، Host باید localhost باشد.
  const host = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (HOST === '0.0.0.0' || HOST === '::') return true;
  return ['localhost', '127.0.0.1', '::1'].includes(host) || host === HOST;
}

async function readJsonBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) throw httpError(413, 'درخواست خیلی بزرگ است.');
  }
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, payload, type = 'application/json; charset=utf-8') {
  const body = type.startsWith('application/json') ? JSON.stringify(payload) : payload;
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (!hostAllowed(req)) return send(res, 403, { ok: false, error: 'Host مجاز نیست' });
    const url = new URL(req.url, 'http://x');

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = await readFile(path.join(HERE, 'index.html'), 'utf8');
      return send(res, 200, html, 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/api/systems') {
      return send(res, 200, { ok: true, host: HOST, systems: await snapshot() });
    }

    // همه‌ی POSTها هدر سفارشی می‌خواهند؛ این جلوی فرم‌های بین‌سایتی را می‌گیرد.
    if (req.method === 'POST' && req.headers['x-dashboard'] !== '1') {
      return send(res, 403, { ok: false, error: 'هدر امنیتی نامعتبر' });
    }

    const m = url.pathname.match(/^\/api\/systems\/([^/]+)\/(start|stop|run|log)(?:\/([^/]+))?$/);
    if (m) {
      const [, id, op, actionId] = m;
      if (!byId.has(id)) return send(res, 404, { ok: false, error: 'سیستم پیدا نشد' });
      if (op === 'log' && req.method === 'GET') {
        return send(res, 200, { ok: true, lines: state.get(id).log.slice(-200) });
      }
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'متد مجاز نیست' });
      if (op === 'start') return send(res, 200, await startServer(id));
      if (op === 'stop') return send(res, 200, stopServer(id));
      if (op === 'run') return send(res, 200, runAction(id, actionId));
    }

    return send(res, 404, { ok: false, error: 'مسیر پیدا نشد' });
  } catch (err) {
    const status = err.status || 500;
    return send(res, status, { ok: false, error: err.message || String(err) });
  }
});

server.listen(DASH_PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`\n🧭 داشبورد سیستم‌ها: http://${shown}:${DASH_PORT}`);
  console.log(`   ریشهٔ پروژه: ${ROOT}`);
  console.log('   برای توقف داشبورد: Ctrl+C (سیستم‌های در حال اجرا هم بسته می‌شوند)\n');
});

function shutdown() {
  for (const st of state.values()) if (isAlive(st.proc)) killTree(st.proc);
  setTimeout(() => process.exit(0), 300).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
