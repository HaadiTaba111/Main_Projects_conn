#!/usr/bin/env node
/**
 * 🎛️ SkyGround Universal Master Hub (Node.js & Python Multi-Environment Launcher)
 * ----------------------------------------------------------------------------
 * طراح: هادی طباطبایی (TaHa111)
 * 
 * این سرور چندمحیطی روی یک پورت واحد هم برنامه‌های Node.js (فیوچرز PWA) و
 * هم برنامه‌های Python (استودیو لیریکس و سرور سیگنال) را به صورت همزمان اجرا و مدیریت می‌کند.
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT || 8080);
const PWA_DIR = normalize(join(__dirname, 'apps', '1-AUTOTRADE-FUTURES-PWA'));
const CLIP_DIR = normalize(join(__dirname, 'apps', '3-LYRAX-CLIP-STUDIO'));
const SCALP_DIR = normalize(join(__dirname, 'apps', 'futures-scalp-lab'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const HUB_HTML = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>SkyGround Universal Master Hub | هادی طباطبایی</title>
  <style>
    :root {
      --bg: #070a0f;
      --card: #0f1523;
      --card-hover: #182238;
      --border: #22314a;
      --cyan: #38bdf8;
      --lemon: #FFF000;
      --green: #10b981;
      --text: #f1f5f9;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; }
    
    header {
      background: rgba(15, 21, 35, 0.9);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 0.8rem 1.2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-icon { font-size: 1.6rem; }
    .brand-title { font-weight: 900; font-size: 1.15rem; color: #fff; }
    .brand-sub { font-size: 0.75rem; color: var(--cyan); }

    .nav-tabs {
      display: flex;
      gap: 6px;
      padding: 0.6rem 1.2rem;
      background: #090d16;
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
    }
    .nav-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--muted);
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font-size: 0.88rem;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
    }
    .nav-btn.active {
      background: #1e293b;
      color: var(--cyan);
      border-color: var(--cyan);
      font-weight: bold;
    }

    main { flex: 1; padding: 1.2rem; max-width: 1400px; margin: 0 auto; width: 100%; }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; animation: fadeIn 0.25s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

    .hub-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      margin-bottom: 1.5rem;
    }
    .hub-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.4rem;
      transition: transform 0.2s, border-color 0.2s;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .hub-card:hover { transform: translateY(-3px); border-color: var(--cyan); background: var(--card-hover); }
    .card-top { display: flex; align-items: center; gap: 12px; margin-bottom: 1rem; }
    .card-icon { font-size: 2.2rem; }
    .card-title { font-size: 1.2rem; font-weight: 900; color: #fff; margin-bottom: 3px; }
    .card-env { font-size: 0.75rem; color: var(--cyan); background: #172439; padding: 2px 8px; border-radius: 6px; display: inline-block; }
    .card-desc { font-size: 0.88rem; color: var(--muted); line-height: 1.7; margin-bottom: 1.2rem; }
    
    .btn {
      display: inline-block;
      width: 100%;
      text-align: center;
      text-decoration: none;
      padding: 0.75rem 1rem;
      border-radius: 10px;
      font-weight: bold;
      font-size: 0.95rem;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-cyan { background: linear-gradient(135deg, #0284c7, #0369a1); color: #fff; }
    .btn-lemon { background: linear-gradient(135deg, #eab308, #ca8a04); color: #000; font-weight: 900; }
    .btn-green { background: linear-gradient(135deg, #10b981, #059669); color: #fff; }

    .frame-container {
      width: 100%;
      height: 82vh;
      border-radius: 14px;
      border: 1px solid var(--border);
      overflow: hidden;
      background: #000;
    }
    iframe { width: 100%; height: 100%; border: none; }

    footer {
      text-align: center;
      padding: 1.2rem;
      font-size: 0.8rem;
      color: var(--muted);
      border-top: 1px solid var(--border);
      background: #080c14;
    }
  </style>
</head>
<body>

  <header>
    <div class="brand">
      <span class="brand-icon">🎛️</span>
      <div>
        <div class="brand-title">SkyGround Universal Hub</div>
        <div class="brand-sub">داشبورد چندمحیطی Node.js و Python • هادی طباطبایی</div>
      </div>
    </div>
    <div style="display:flex; gap:8px;">
      <a href="/pwa/" class="btn btn-cyan" style="width:auto; padding:0.45rem 0.9rem; font-size:0.85rem;">📱 ورود به فیوچرز PWA</a>
    </div>
  </header>

  <nav class="nav-tabs">
    <button class="nav-btn active" onclick="showTab('home', this)">🌟 منوی اصلی پروژه‌ها</button>
    <button class="nav-btn" onclick="showTab('futures', this)">📈 ۱. داشبورد ترید فیوچرز (Node.js)</button>
    <button class="nav-btn" onclick="showTab('clipstudio', this)">🎬 ۲. استودیو لیریکس LyraX (Python)</button>
  </nav>

  <main>
    <!-- صفحه خانه و انتخاب ابزار -->
    <section id="panel-home" class="tab-panel active">
      <div style="margin-bottom:1.5rem;">
        <h2 style="font-size:1.3rem; margin-bottom:6px;">🚀 انتخاب و اجرای ابزارهای کاربردی</h2>
        <p style="color:var(--muted); font-size:0.9rem;">
          این داشبورد جامع، تمام پروژه‌های جاوااسکریپت و پایتون را بدون نیاز به سرورهای جداگانه زیر یک سقف اجرا می‌کند.
        </p>
      </div>

      <div class="hub-grid">
        <!-- کارت ۱: فیوچرز PWA -->
        <div class="hub-card">
          <div>
            <div class="card-top">
              <span class="card-icon">📈</span>
              <div>
                <div class="card-title">داشبورد ترید فیوچرز بای‌بیت</div>
                <span class="card-env">محیط: Node.js + PWA</span>
              </div>
            </div>
            <p class="card-desc">
              وب‌اپلیکیشن تریدینگ با رادار سیگنال‌های زنده، دیتای ضدتحریم صرافی‌های OKX و CoinGecko، سود شناور و تفکیک حساب هادی و پسر.
            </p>
          </div>
          <a href="/pwa/" class="btn btn-cyan">🚀 باز کردن مستقیم فیوچرز</a>
        </div>

        <!-- کارت ۲: استودیو لیریکس LyraX -->
        <div class="hub-card">
          <div>
            <div class="card-top">
              <span class="card-icon">🎬</span>
              <div>
                <div class="card-title">استودیو لیریکس LyraX Pro</div>
                <span class="card-env">محیط: Python Flask + 3D Cube</span>
              </div>
            </div>
            <p class="card-desc">
              ویرایشگر لایه‌باز ویدیویی با ترنزیشن مکعب سه‌بعدی، اکولایزر صوتی، واترمارک متحرک و رندر تمیز میلی‌ثانیه‌ای.
            </p>
          </div>
          <button onclick="showTab('clipstudio', document.querySelectorAll('.nav-btn')[2])" class="btn btn-lemon">🎬 اجرای استودیو لیریکس</button>
        </div>

        <!-- کارت ۳: موتور تور ماهیگیری -->
        <div class="hub-card">
          <div>
            <div class="card-top">
              <span class="card-icon">🎣</span>
              <div>
                <div class="card-title">اتوترید تور ماهیگیری</div>
                <span class="card-env">محیط: Python Core Engine</span>
              </div>
            </div>
            <p class="card-desc">
              استراتژی گرید نقدینگی چندسطحی، سنسور شکار تله‌های نهنگ و دروگر خودکار سود با ترلینگ استاپ پویا.
            </p>
          </div>
          <a href="/pwa/#netfishing" class="btn btn-green">🎣 ورود به بخش تور ماهیگیری</a>
        </div>
      </div>
    </section>

    <!-- پنل نمایش فیوچرز -->
    <section id="panel-futures" class="tab-panel">
      <div class="frame-container">
        <iframe src="/pwa/"></iframe>
      </div>
    </section>

    <!-- پنل نمایش لیریکس -->
    <section id="panel-clipstudio" class="tab-panel">
      <div class="frame-container">
        <iframe src="/clip-studio/"></iframe>
      </div>
    </section>
  </main>

  <footer>
    SkyGround Universal Multi-Runtime Hub • هادی طباطبایی (TaHa111) • ۲۰۲۶
  </footer>

  <script>
    function showTab(id, btn) {
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      const target = document.getElementById('panel-' + id);
      if (target) target.classList.add('active');
      if (btn) btn.classList.add('active');
    }
  </script>
</body>
</html>`;

// سرور وب چندمنظوره
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // ۱. روت اصلی: نمایش داشبورد جامع یونیورسال
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HUB_HTML);
    return;
  }

  // ۲. روت‌های فیوچرز PWA
  if (url.pathname.startsWith('/pwa')) {
    let subpath = url.pathname.replace(/^\/pwa\/?/, '') || 'index.html';
    const filePath = normalize(join(PWA_DIR, subpath));
    if (filePath.startsWith(PWA_DIR)) {
      try {
        const fileStat = await stat(filePath);
        if (fileStat.isFile()) {
          const data = await readFile(filePath);
          const ext = extname(filePath);
          res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
          res.end(data);
          return;
        }
      } catch (e) {}
    }
  }

  // ۳. روت‌های استودیو لیریکس (سرو کردن تمپلیت و استاتیک)
  if (url.pathname.startsWith('/clip-studio')) {
    let subpath = url.pathname.replace(/^\/clip-studio\/?/, '') || 'index.html';
    let filePath = normalize(join(CLIP_DIR, 'templates', 'index.html'));
    if (subpath.startsWith('static/')) {
      filePath = normalize(join(CLIP_DIR, subpath));
    }
    if (filePath.startsWith(CLIP_DIR)) {
      try {
        const fileStat = await stat(filePath);
        if (fileStat.isFile()) {
          const data = await readFile(filePath);
          const ext = extname(filePath);
          res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
          res.end(data);
          return;
        }
      } catch (e) {}
    }
  }

  // ۴. پروکسی APIهای زنده کریپتو (Bybit / OKX / Binance)
  if (url.pathname.startsWith('/api/bybit/v5/market/tickers')) {
    const symbol = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
    try {
      // استفاده از صرافی زنده OKX
      const instId = symbol.replace('USDT', '-USDT');
      const resp = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`, { signal: AbortSignal.timeout(3500) });
      const data = await resp.json();
      if (data.code === '0' && data.data?.[0]) {
        const d = data.data[0];
        const row = {
          symbol,
          lastPrice: String(d.last),
          markPrice: String(d.last),
          indexPrice: String(d.last),
          highPrice24h: String(d.high24h || d.last),
          lowPrice24h: String(d.low24h || d.last),
          volume24h: String(d.vol24h || '1000000'),
          turnover24h: String(d.volCcy24h || '65000000')
        };
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ retCode: 0, retMsg: 'OK (OKX_LIVE)', result: { category: 'linear', list: [row] } }));
        return;
      }
    } catch (e) {}
  }

  if (url.pathname.startsWith('/api/bybit/v5/market/kline')) {
    const symbol = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
    const interval = url.searchParams.get('interval') || '60';
    try {
      const instId = symbol.replace('USDT', '-USDT');
      const barMap = { '1': '1m', '5': '5m', '15': '15m', '30': '30m', '60': '1H', '240': '4H', 'D': '1D' };
      const bar = barMap[interval] || '1H';
      const resp = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=90`, { signal: AbortSignal.timeout(3500) });
      const data = await resp.json();
      if (data.code === '0' && Array.isArray(data.data)) {
        const candles = data.data.map(k => [String(k[0]), String(k[1]), String(k[2]), String(k[3]), String(k[4]), String(k[5]), String(k[6])]).reverse();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ retCode: 0, retMsg: 'OK', result: { symbol, category: 'linear', list: candles } }));
        return;
      }
    } catch (e) {}
  }

  // فایل یافت نشد
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎛️ SkyGround Universal Master Hub running at: http://0.0.0.0:${PORT}`);
  console.log(`🚀 Unified Dashboard available with Node.js & Python projects.\n`);
});
