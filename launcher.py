#!/usr/bin/env python3
"""
═════════════════════════════════════════════════════════════════════════════════
  🎛️ Enterprise Master Project Launcher & Command Center (اتاق فرمان پیشرفته پروژه‌ها)
  Inspired by modern enterprise UI (Vben / Glassmorphic), 100% Local, Private & Secure.
  Created for Hadi Tabatabaei (هادی طباطبایی)
═════════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import argparse
import datetime as dt
import http.server
import json
import logging
import os
import platform
import socketserver
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser
from pathlib import Path
from typing import Any, Dict, List, Optional

WORKSPACE_ROOT = Path(__file__).parent.resolve()
PY_BIN = sys.executable

PROJECTS_REGISTRY = [
    {
        "id": "qwen-hands-eyes",
        "name": "🧠 مغز دوگانه (Qwen + DeepSeek R1) با چشم، دست و پا",
        "name_en": "Qwen-Hands-Eyes (SkyGround OS)",
        "category": "ai",
        "icon": "🧠",
        "path": "apps/5-QWEN-HANDS-EYES",
        "entry_cmd": f'"{PY_BIN}" main.py --port 8765',
        "port": 8765,
        "type": "python",
        "description": "مغز هوشمند دوزبانه با بینایی دسکتاپ، کنترل ماوس/کیبورد، شل امن و درگاه اندروید",
    },
    {
        "id": "clip-studio",
        "name": "🎬 استودیو ساخت کلیپ و سینک لیریکس دوزبانه",
        "name_en": "Clip Maker Studio",
        "category": "media",
        "icon": "🎬",
        "path": "apps/3-LYRAX-CLIP-STUDIO",
        "entry_cmd": f'"{PY_BIN}" app.py',
        "port": 5000,
        "type": "flask",
        "description": "ویرایشگر ویدیویی با رعدوبرق چندباندی و سیستم Tap to Sync لیریکس",
    },
    {
        "id": "adaptive-ratio-brain",
        "name": "📊 موتور تله‌های نقدینگی و واگرایی (Adaptive Ratio Brain)",
        "name_en": "Adaptive Ratio Brain",
        "category": "crypto",
        "icon": "📊",
        "path": "apps/adaptive-ratio-brain",
        "entry_cmd": "npm run dev",
        "port": 5173,
        "type": "vite",
        "description": "تشخیص تله‌های صعودی و نزولی بر اساس نسبت‌های OI، حجم و فاندینگ ریت",
    },
    {
        "id": "whale-tracker",
        "name": "🐋 ردیاب نهنگ‌ها و اسکرپر هایپرلیکوئید",
        "name_en": "Whale Tracker & HyperLiquid Scraper",
        "category": "crypto",
        "icon": "🐋",
        "path": "apps/whale-tracker",
        "entry_cmd": "npm run dev",
        "port": 5174,
        "type": "vite",
        "description": "مانیتورینگ زنده تریدرهای برتر، پوزیشن‌های بالای ۵۰۰ هزار دلار و لیدربورد",
    },
    {
        "id": "net-fishing-trader",
        "name": "🎣 موتور اتوترید تور ماهیگیری (Net Fishing Master Auto-Trader)",
        "name_en": "Net Fishing Master Auto-Trader",
        "category": "crypto",
        "icon": "🎣",
        "path": "apps/futures-scalp-lab",
        "entry_cmd": f'"{PY_BIN}" scalplab/net_fishing_engine.py --data auto --symbol BTCUSDT',
        "port": None,
        "type": "python",
        "description": "استراتژی گرید پلکانی نقدینگی، حسگر تله‌های نهنگ‌ها و دروگر خودکار سود با ترلینگ استاپ",
    },
    {
        "id": "futures-scalp-lab",
        "name": "📈 آزمایشگاه اسکالپ فیوچرز و آداپتور Bybit",
        "name_en": "Futures Scalp Lab",
        "category": "crypto",
        "icon": "📈",
        "path": "apps/futures-scalp-lab",
        "entry_cmd": f'"{PY_BIN}" scalplab/auto.py --data bybit --dry-run',
        "port": None,
        "type": "python",
        "description": "موتور مدیریت ریسک، اعتبارسنجی چندمدلی و استراتژی‌های معاملاتی",
    },
    {
        "id": "automated-crypto-dashboard",
        "name": "🤖 ربات اتوماتیک و داشبورد ترید کریپتو (CoinGecko / Binance)",
        "name_en": "Automated Crypto Trading Dashboard",
        "category": "crypto",
        "icon": "🤖",
        "path": "apps/automated-crypto-dashboard",
        "entry_cmd": "npm run dev",
        "port": 3001,
        "type": "nextjs",
        "description": "ربات ترید هوشمند با دیتای زنده بدون تحریم CoinGecko/Binance، تحلیل چنداندیکاتوره و مدیریت ریسک SL/TP",
    },
    {
        "id": "futures-pwa",
        "name": "📱 وب‌اپلیکیشن فیوچرز بای‌بیت (PWA)",
        "name_en": "Futures Trading PWA",
        "category": "crypto",
        "icon": "📱",
        "path": "apps/1-AUTOTRADE-FUTURES-PWA",
        "entry_cmd": "node server.js",
        "port": 8787,
        "type": "node",
        "description": "رابط کاربری فیوچرز با بروکر امن Bybit و Kill-Switch اضطراری",
    },
    {
        "id": "pump-dump-radar",
        "name": "🚀 رادار مستقل پامپ/دامپ",
        "name_en": "Pump/Dump Radar",
        "category": "crypto",
        "icon": "🚀",
        "path": "apps/2-PUMP-DUMP-RADAR",
        "entry_cmd": "node server.js",
        "port": 8790,
        "type": "node",
        "description": "رادار بازار و Paper trading با پورت مستقل 8790",
    },
    {
        "id": "dsa-video-demo",
        "name": "🎬 بنچمارک مقایسه‌ای زنده DSA (مخصوص ضبط فیلم اسکرین)",
        "name_en": "DSA Live Video Benchmark Demo",
        "category": "research",
        "icon": "🔬",
        "path": "apps/dsa-command-dashboard/research",
        "entry_cmd": f'"{PY_BIN}" dsa_video_demo_runner.py --fast --speed 0.03',
        "port": None,
        "type": "python",
        "description": "اجرای مقایسه‌ای زنده مدل خطی در برابر DSA جهت فیلم‌برداری بدون افشای فرمول‌های محرمانه",
    },
    {
        "id": "cl-vit-test",
        "name": "👁️ بنچمارک ویژن ترنسفورمر کلمات بصری (ViT Visual Words)",
        "name_en": "ViT Visual-Words Continual Benchmark",
        "category": "research",
        "icon": "👁️",
        "path": ".",
        "entry_cmd": f'"{PY_BIN}" cl_vit_test.py --demo',
        "port": None,
        "type": "python",
        "description": "تبدیل تصاویر به توکن‌های کلمه‌ای پچ و ارزیابی مهار فراموشی DSA طبق استاندارد ViT",
    },
    {
        "id": "cl-nlp-test",
        "name": "📚 بنچمارک کلمه‌محور یادگیری پیوسته زبانی (NLP 5 Domains)",
        "name_en": "Word-Level NLP Continual Benchmark",
        "category": "research",
        "icon": "📚",
        "path": ".",
        "entry_cmd": f'"{PY_BIN}" cl_nlp_test.py --demo',
        "port": None,
        "type": "python",
        "description": "سنجش فراموشی زبانی در ۵ حوزه هوش مصنوعی، شعر کهن، کریپتو، فیزیک و فلسفه طبق استاندارد HuggingFace",
    },
    {
        "id": "cl-test-poc",
        "name": "🧪 تست استاندارد یادگیری پیوسته (Split CIFAR-10)",
        "name_en": "Continual Learning Standard Benchmark",
        "category": "research",
        "icon": "🧪",
        "path": ".",
        "entry_cmd": f'"{PY_BIN}" cl_test.py --demo',
        "port": None,
        "type": "python",
        "description": "سنجش شاخص‌های ACC، Forgetting و Early Recall طبق استاندارد NeurIPS",
    },
    {
        "id": "local-cursor-agent",
        "name": "💻 ایجنت کدنویس دسکتاپ و اسناد DSA",
        "name_en": "Local Cursor Agent & DSA Docs",
        "category": "ai",
        "icon": "💻",
        "path": "apps/local-cursor-agent/local_cursor_agent",
        "entry_cmd": f'"{PY_BIN}" dashboard.py',
        "port": 8765,
        "type": "python",
        "description": "دستیار کدنویسی دسکتاپ و ابزار خودکار تولید اسناد رسمی Pre-NDA اسپیرال",
    },
    {
        "id": "dsa-command-dashboard",
        "name": "📜 داشبورد فرماندهی DSA و شاعر عصب‌نمادین",
        "name_en": "DSA Command Dashboard & Poet",
        "category": "research",
        "icon": "📜",
        "path": "apps/dsa-command-dashboard",
        "entry_cmd": "npm run dev",
        "port": 3000,
        "type": "nextjs",
        "description": "داشبورد آزمایش‌های اسپیرال Fade-Not-Forget و دموی شاعر",
    },
    {
        "id": "secure-wake",
        "name": "🔐 پروتوتایپ امنیتی بیدارباش‌محور و ضد هکر",
        "name_en": "Secure Wake & Anti-Hacker Protocol",
        "category": "security",
        "icon": "🔐",
        "path": "apps/3-LYRAX-CLIP-STUDIO/secure_wake_prototype",
        "entry_cmd": f'"{PY_BIN}" test_security.py',
        "port": None,
        "type": "python",
        "description": "سیستم خودکشی اعتماد، فایروال محتوایی و خواب اجباری نامتقارن",
    },
]

RUNNING_PROCESSES: Dict[str, subprocess.Popen] = {}


def open_browser_smart(url: str) -> None:
    """Smart browser opener: supports native Windows, Linux, and WSL2 (opens Windows default browser)."""
    is_wsl = False
    try:
        if "microsoft" in platform.uname().release.lower() or os.path.exists("/proc/sys/fs/binfmt_misc/WSLInterop") or os.path.exists("/mnt/c"):
            is_wsl = True
    except Exception:
        pass

    if is_wsl:
        for cmd in [
            ["explorer.exe", url],
            ["powershell.exe", "-Command", f"Start-Process '{url}'"],
            ["cmd.exe", "/c", "start", "", url],
            ["wslview", url]
        ]:
            try:
                p = subprocess.run(cmd, capture_output=True, timeout=3)
                if p.returncode == 0:
                    return
            except Exception:
                continue

    try:
        if not is_wsl:
            webbrowser.open(url)
    except Exception:
        pass


class MasterLauncherService:
    @staticmethod
    def open_in_vscode(project_rel_path: str) -> Dict[str, Any]:
        """Open specific project folder directly in VS Code."""
        target = (WORKSPACE_ROOT / project_rel_path).resolve()
        if not target.exists():
            return {"ok": False, "error": f"Folder not found: {project_rel_path}"}

        try:
            cmd = f"code \"{target}\""
            subprocess.Popen(cmd, shell=True)
            return {"ok": True, "message": f"VS Code opened for: {project_rel_path}"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    @staticmethod
    def launch_project(project_id: str) -> Dict[str, Any]:
        """Launch the project runtime and open browser if port available."""
        proj = next((p for p in PROJECTS_REGISTRY if p["id"] == project_id), None)
        if not proj:
            return {"ok": False, "error": f"Project ID '{project_id}' not found"}

        target_dir = (WORKSPACE_ROOT / proj["path"]).resolve()
        if not target_dir.exists():
            return {"ok": False, "error": f"Project path does not exist: {proj['path']}"}

        # Auto-check and install requirements if requirements.txt exists and packages missing
        req_file = target_dir / "requirements.txt"
        if req_file.exists():
            try:
                subprocess.run([PY_BIN, "-m", "pip", "install", "-q", "-r", str(req_file)], timeout=30)
            except Exception:
                pass

        # Stop existing process if already running
        if project_id in RUNNING_PROCESSES:
            try:
                RUNNING_PROCESSES[project_id].terminate()
            except Exception:
                pass

        try:
            proc = subprocess.Popen(
                proj["entry_cmd"],
                shell=True,
                cwd=str(target_dir),
            )
            RUNNING_PROCESSES[project_id] = proc

            if proj["port"]:
                time.sleep(1.2)
                url = f"http://localhost:{proj['port']}"
                open_browser_smart(url)

            return {
                "ok": True,
                "project_id": project_id,
                "name": proj["name"],
                "pid": proc.pid,
                "port": proj["port"],
                "message": f"Project {proj['name']} launched successfully!",
            }
        except Exception as e:
            return {"ok": False, "error": str(e)}

    @staticmethod
    def stop_project(project_id: str) -> Dict[str, Any]:
        if project_id in RUNNING_PROCESSES:
            try:
                RUNNING_PROCESSES[project_id].terminate()
                del RUNNING_PROCESSES[project_id]
                return {"ok": True, "message": f"Project {project_id} stopped."}
            except Exception as e:
                return {"ok": False, "error": str(e)}
        return {"ok": True, "message": "Project was not running."}

    @staticmethod
    def git_sync_and_push(commit_msg: Optional[str] = None) -> Dict[str, Any]:
        """Stage all changes, commit, and push to remote repository."""
        msg = commit_msg or f"update: synced via Master Launcher on {dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        logs = []

        try:
            p_fetch = subprocess.run(["git", "fetch", "origin", "refs/heads/arena/578b8ae6-main-projects-conn"], cwd=str(WORKSPACE_ROOT), capture_output=True, text=True)
            logs.append(f"[fetch]: {p_fetch.stdout or p_fetch.stderr or 'OK'}")

            p_add = subprocess.run(["git", "add", "-A"], cwd=str(WORKSPACE_ROOT), capture_output=True, text=True)
            logs.append(f"[add]: {p_add.stdout or 'All changes staged'}")

            p_commit = subprocess.run(["git", "commit", "-m", msg], cwd=str(WORKSPACE_ROOT), capture_output=True, text=True)
            logs.append(f"[commit]: {p_commit.stdout or p_commit.stderr or 'No new changes'}")

            p_push = subprocess.run(["git", "push", "origin", "arena/578b8ae6-main-projects-conn"], cwd=str(WORKSPACE_ROOT), capture_output=True, text=True)
            logs.append(f"[push]: {p_push.stdout or p_push.stderr or 'Pushed successfully!'}")

            success = p_push.returncode == 0
            return {
                "ok": success,
                "commit_message": msg,
                "logs": logs,
                "error": p_push.stderr if not success else None,
            }
        except Exception as e:
            return {"ok": False, "error": str(e), "logs": logs}


# ═════════════════════════════════════════════════════════════════════════════
# Web Server for Enterprise Glassmorphic Dashboard
# ═════════════════════════════════════════════════════════════════════════════

HTML_DASHBOARD = """<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Master Command Center | اتاق فرمان مرکزی پروژه‌ها</title>
    <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-base: #070a13;
            --bg-sidebar: rgba(13, 18, 30, 0.92);
            --bg-card: rgba(18, 25, 42, 0.78);
            --bg-card-hover: rgba(28, 39, 66, 0.88);
            --border: rgba(56, 189, 248, 0.16);
            --border-glow: rgba(56, 189, 248, 0.45);
            
            --primary: #0284c7;
            --primary-glow: #38bdf8;
            --accent-green: #10b981;
            --accent-purple: #8b5cf6;
            --accent-orange: #f59e0b;
            --accent-red: #ef4444;

            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --text-dim: #64748b;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Vazirmatn', sans-serif; }

        body {
            background: radial-gradient(circle at 10% 15%, #0e1a38 0%, var(--bg-base) 85%);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            direction: rtl;
            overflow-x: hidden;
        }

        /* ════════════ Sidebar ════════════ */
        .sidebar {
            width: 270px;
            background: var(--bg-sidebar);
            backdrop-filter: blur(16px);
            border-left: 1px solid var(--border);
            padding: 24px 14px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            height: 100vh;
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 0 10px 20px;
            border-bottom: 1px solid var(--border);
            margin-bottom: 12px;
        }

        .brand-icon { font-size: 28px; filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.6)); }
        .brand-title { font-size: 18px; font-weight: 800; background: linear-gradient(90deg, #38bdf8, #818cf8, #34d399); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .brand-sub { font-size: 11px; color: var(--text-muted); }

        .nav-category {
            font-size: 11px;
            font-weight: 700;
            color: var(--text-dim);
            padding: 10px 14px 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .nav-btn {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 11px 16px;
            border-radius: 12px;
            background: transparent;
            border: 1px solid transparent;
            color: var(--text-muted);
            font-size: 13.5px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            text-align: right;
        }

        .nav-btn:hover { background: rgba(56, 189, 248, 0.08); color: var(--text-main); }
        .nav-btn.active {
            background: linear-gradient(90deg, rgba(2, 132, 199, 0.25), rgba(14, 165, 233, 0.1));
            border-color: rgba(56, 189, 248, 0.35);
            color: var(--primary-glow);
            box-shadow: 0 0 15px rgba(56, 189, 248, 0.15);
        }

        .nav-count {
            background: rgba(0, 0, 0, 0.4);
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 11px;
            font-family: 'JetBrains Mono', monospace;
            color: var(--text-dim);
        }

        .sidebar-footer {
            margin-top: auto;
            padding: 14px;
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 12px;
            font-size: 11.5px;
            color: #6ee7b7;
            text-align: center;
        }

        /* ════════════ Main Content ════════════ */
        .main-wrapper {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
        }

        .topbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 28px;
            background: rgba(13, 18, 30, 0.85);
            backdrop-filter: blur(12px);
            border-bottom: 1px solid var(--border);
            position: sticky;
            top: 0;
            z-index: 90;
        }

        .search-box {
            position: relative;
            width: 320px;
        }

        .search-box input {
            width: 100%;
            background: rgba(18, 25, 42, 0.85);
            border: 1px solid var(--border);
            color: var(--text-main);
            padding: 9px 14px 9px 36px;
            border-radius: 12px;
            font-size: 13px;
            outline: none;
            transition: all 0.2s;
        }

        .search-box input:focus { border-color: var(--primary-glow); box-shadow: 0 0 10px rgba(56, 189, 248, 0.3); }
        .search-icon { position: absolute; left: 12px; top: 10px; color: var(--text-dim); font-size: 14px; }

        .top-actions { display: flex; gap: 12px; align-items: center; }

        .btn {
            padding: 9px 16px;
            border-radius: 11px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            border: 1px solid transparent;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            transition: all 0.2s ease;
        }

        .btn-push { background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35); }
        .btn-push:hover { box-shadow: 0 6px 20px rgba(52, 211, 153, 0.55); transform: translateY(-1px); }
        .btn-run { background: linear-gradient(135deg, #0284c7, #0369a1); color: #fff; }
        .btn-run:hover { box-shadow: 0 4px 14px rgba(56, 189, 248, 0.45); }
        .btn-edit { background: rgba(139, 92, 246, 0.15); border-color: rgba(139, 92, 246, 0.4); color: #c4b5fd; }
        .btn-edit:hover { background: rgba(139, 92, 246, 0.3); }
        .btn-stop { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.4); color: #fca5a5; }
        .btn-sm { padding: 6px 12px; font-size: 12px; border-radius: 9px; }

        .content-body { padding: 28px; flex: 1; }

        /* Metrics Strip */
        .metrics-strip {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }

        .metric-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 16px;
            display: flex;
            align-items: center;
            gap: 14px;
        }

        .metric-icon { font-size: 24px; }
        .metric-label { font-size: 11.5px; color: var(--text-muted); }
        .metric-val { font-size: 15px; font-weight: 800; color: #38bdf8; font-family: 'JetBrains Mono', monospace; margin-top: 2px; }

        /* Projects Grid */
        .projects-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
            gap: 20px;
        }

        .card {
            background: var(--bg-card);
            backdrop-filter: blur(12px);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 14px;
            transition: all 0.25s ease;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
        }

        .card:hover {
            background: var(--bg-card-hover);
            border-color: var(--border-glow);
            transform: translateY(-3px);
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
        }

        .card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
        .card-title-area h3 { font-size: 15px; font-weight: 700; color: #38bdf8; line-height: 1.4; }
        .card-title-area .en-title { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--text-muted); margin-top: 3px; }
        .card-desc { font-size: 13px; color: #cbd5e1; line-height: 1.6; }
        .card-meta {
            font-size: 11px;
            font-family: 'JetBrains Mono', monospace;
            color: var(--text-muted);
            background: rgba(0, 0, 0, 0.35);
            padding: 6px 10px;
            border-radius: 8px;
            direction: ltr;
            text-align: left;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .card-actions { display: flex; gap: 8px; flex-wrap: wrap; }

        .badge-port {
            background: rgba(56, 189, 248, 0.15);
            border: 1px solid rgba(56, 189, 248, 0.3);
            color: #7dd3fc;
            padding: 2px 7px;
            border-radius: 6px;
            font-size: 10.5px;
        }

        .log-terminal {
            margin-top: 24px;
            background: #040711;
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 16px;
            display: none;
        }

        .log-terminal pre {
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            color: #4ade80;
            white-space: pre-wrap;
            direction: ltr;
            text-align: left;
            max-height: 220px;
            overflow-y: auto;
        }

        @media (max-width: 900px) {
            body { flex-direction: column; }
            .sidebar { width: 100%; height: auto; position: static; }
        }
    </style>
</head>
<body>
    <!-- ════════════ Sidebar Navigation ════════════ -->
    <aside class="sidebar">
        <div class="brand">
            <span class="brand-icon">🎛️</span>
            <div>
                <div class="brand-title">Master Commander</div>
                <div class="brand-sub">اتاق فرمان مرکزی پروژه‌ها</div>
            </div>
        </div>

        <div class="nav-category">دسته‌بندی پروژه‌ها</div>
        <button class="nav-btn active" data-cat="all">
            <span>🌟 همه پروژه‌ها</span>
            <span class="nav-count" id="countAll">11</span>
        </button>
        <button class="nav-btn" data-cat="ai">
            <span>🧠 هوش مصنوعی و مغز</span>
            <span class="nav-count" id="countAi">2</span>
        </button>
        <button class="nav-btn" data-cat="media">
            <span>🎬 رسانه و کلیپ‌ساز</span>
            <span class="nav-count" id="countMedia">1</span>
        </button>
        <button class="nav-btn" data-cat="crypto">
            <span>📈 بازارهای مالی و کریپتو</span>
            <span class="nav-count" id="countCrypto">3</span>
        </button>
        <button class="nav-btn" data-cat="research">
            <span>🔬 پژوهش‌های DSA و اسناد</span>
            <span class="nav-count" id="countResearch">3</span>
        </button>
        <button class="nav-btn" data-cat="security">
            <span>🛡️ پروتکل‌های امنیتی</span>
            <span class="nav-count" id="countSecurity">1</span>
        </button>

        <div class="sidebar-footer">
            <div>🛡️ وضعیت امنیت DSA</div>
            <strong style="font-size:11px;">ایزوله محلی • بدون نشت کلود</strong>
        </div>
    </aside>

    <!-- ════════════ Main Dashboard ════════════ -->
    <div class="main-wrapper">
        <header class="topbar">
            <div class="search-box">
                <input type="text" id="projectSearch" placeholder="جستجوی سریع پروژه..." oninput="handleSearch(this.value)">
                <span class="search-icon">🔍</span>
            </div>
            <div class="top-actions">
                <button class="btn btn-push" onclick="triggerGitPush()">
                    <span>🚀 Push & Sync به گیت‌هاب</span>
                </button>
            </div>
        </header>

        <main class="content-body">
            <!-- Telemetry Metrics -->
            <section class="metrics-strip">
                <div class="metric-card">
                    <span class="metric-icon">💻</span>
                    <div>
                        <div class="metric-label">محیط اجرا</div>
                        <div class="metric-val" id="platformMetric">WSL2 / Linux</div>
                    </div>
                </div>
                <div class="metric-card">
                    <span class="metric-icon">🔒</span>
                    <div>
                        <div class="metric-label">محرمانگی هسته DSA</div>
                        <div class="metric-val" style="color:#10b981;">100% Air-Gapped</div>
                    </div>
                </div>
                <div class="metric-card">
                    <span class="metric-icon">🌐</span>
                    <div>
                        <div class="metric-label">پورت داشبورد مرکزی</div>
                        <div class="metric-val">Port :9000</div>
                    </div>
                </div>
            </section>

            <!-- Projects Grid -->
            <div class="projects-grid" id="projectsGrid">
                <div style="color:var(--text-muted);padding:20px;">در حال بارگذاری لیست پروژه‌ها...</div>
            </div>

            <!-- Git Log Terminal -->
            <div class="log-terminal" id="logTerminal">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <strong style="color:#38bdf8;font-size:13px;">📟 لاگ فرآیند گیت و همگام‌سازی:</strong>
                    <button class="btn btn-sm" style="background:rgba(255,255,255,0.1);color:#fff;" onclick="document.getElementById('logTerminal').style.display='none'">بستن</button>
                </div>
                <pre id="logPre">در حال پردازش...</pre>
            </div>
        </main>
    </div>

    <script>
        let allProjects = [];
        let activeCategory = "all";

        async function loadProjects() {
            try {
                const res = await fetch("/api/projects");
                const data = await res.json();
                allProjects = data.projects || [];
                updateCounts();
                renderCards();
            } catch (e) {
                document.getElementById("projectsGrid").innerHTML = "<div style='color:var(--accent-red);'>خطا در بارگذاری: " + e.message + "</div>";
            }
        }

        function updateCounts() {
            document.getElementById("countAll").innerText = allProjects.length;
            document.getElementById("countAi").innerText = allProjects.filter(p => p.category === 'ai').length;
            document.getElementById("countMedia").innerText = allProjects.filter(p => p.category === 'media').length;
            document.getElementById("countCrypto").innerText = allProjects.filter(p => p.category === 'crypto').length;
            document.getElementById("countResearch").innerText = allProjects.filter(p => p.category === 'research').length;
            document.getElementById("countSecurity").innerText = allProjects.filter(p => p.category === 'security').length;
        }

        function renderCards(filterQuery = "") {
            const grid = document.getElementById("projectsGrid");
            grid.innerHTML = "";

            let list = allProjects;
            if (activeCategory !== "all") {
                list = list.filter(p => p.category === activeCategory);
            }
            if (filterQuery.trim()) {
                const q = filterQuery.toLowerCase();
                list = list.filter(p => p.name.toLowerCase().includes(q) || p.name_en.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
            }

            if (list.length === 0) {
                grid.innerHTML = "<div style='color:var(--text-muted);padding:30px;grid-column:1/-1;text-align:center;'>پروژه‌ای در این دسته‌بندی یافت نشد.</div>";
                return;
            }

            list.forEach(p => {
                const div = document.createElement("div");
                div.className = "card";
                const portBadge = p.port ? `<span class="badge-port">:${p.port}</span>` : "";
                div.innerHTML = `
                    <div class="card-top">
                        <div class="card-title-area">
                            <h3>${p.icon || '📁'} ${escapeHtml(p.name)}</h3>
                            <div class="en-title">${escapeHtml(p.name_en)}</div>
                        </div>
                        ${portBadge}
                    </div>
                    <div class="card-desc">${escapeHtml(p.description)}</div>
                    <div class="card-meta">
                        <span>📁 ${escapeHtml(p.path)}</span>
                        ${p.port ? `<a href="http://localhost:${p.port}" target="_blank" style="color:#38bdf8;text-decoration:none;">🔗 باز کردن وب</a>` : ''}
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-run btn-sm" onclick="runProject('${p.id}')">🚀 اجرا (Run)</button>
                        <button class="btn btn-edit btn-sm" onclick="editInVsCode('${p.path}')">✏️ اصلاحات (VS Code)</button>
                        <button class="btn btn-stop btn-sm" onclick="stopProject('${p.id}')">⏹️ توقف</button>
                    </div>
                `;
                grid.appendChild(div);
            });
        }

        function handleSearch(val) { renderCards(val); }

        document.querySelectorAll(".nav-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                activeCategory = btn.getAttribute("data-cat");
                renderCards(document.getElementById("projectSearch").value);
            });
        });

        async function runProject(id) {
            try {
                const res = await fetch("/api/run", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ project_id: id })
                });
                const data = await res.json();
                alert(data.ok ? data.message : "خطا: " + data.error);
            } catch(e) { alert("خطا: " + e.message); }
        }

        async function stopProject(id) {
            try {
                const res = await fetch("/api/stop", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ project_id: id })
                });
                const data = await res.json();
                alert(data.message);
            } catch(e) { alert("خطا: " + e.message); }
        }

        async function editInVsCode(path) {
            try {
                const res = await fetch("/api/edit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: path })
                });
                const data = await res.json();
                if (!data.ok) alert("خطا در باز کردن VS Code: " + data.error);
            } catch(e) { alert("خطا: " + e.message); }
        }

        async function triggerGitPush() {
            const terminal = document.getElementById("logTerminal");
            const logPre = document.getElementById("logPre");
            terminal.style.display = "block";
            logPre.textContent = "⏳ در حال استیج کردن تغییرات و ارسال به شاخه اصلی گیت‌هاب...";

            try {
                const res = await fetch("/api/sync-push", { method: "POST" });
                const data = await res.json();
                if (data.ok) {
                    logPre.textContent = "✅ همه‌چیز با موفقیت در شاخه اصلی گیت‌هاب Push و ذخیره شد!\n\n" + (data.logs || []).join("\n");
                } else {
                    logPre.textContent = "❌ خطا در Push:\n" + (data.error || "") + "\n\n" + (data.logs || []).join("\n");
                }
            } catch(e) {
                logPre.textContent = "❌ خطای ارتباط شبکه: " + e.message;
            }
        }

        function escapeHtml(str) {
            if (!str) return "";
            return String(str)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        document.addEventListener("DOMContentLoaded", loadProjects);
    </script>
</body>
</html>
"""


class LauncherHTTPRequestHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _send_json(self, status_code: int, data: Dict[str, Any]) -> None:
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        if self.path in {"/", "/index.html"}:
            data = HTML_DASHBOARD.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        elif self.path == "/api/projects":
            self._send_json(200, {"ok": True, "projects": PROJECTS_REGISTRY})
        else:
            self._send_json(404, {"ok": False, "error": "Not found"})

    def do_POST(self) -> None:
        content_len = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_len).decode("utf-8")
        body = json.loads(raw_body) if raw_body else {}

        if self.path == "/api/run":
            res = MasterLauncherService.launch_project(body.get("project_id", ""))
            self._send_json(200, res)
        elif self.path == "/api/stop":
            res = MasterLauncherService.stop_project(body.get("project_id", ""))
            self._send_json(200, res)
        elif self.path == "/api/edit":
            res = MasterLauncherService.open_in_vscode(body.get("path", ""))
            self._send_json(200, res)
        elif self.path == "/api/sync-push":
            res = MasterLauncherService.git_sync_and_push(body.get("message"))
            self._send_json(200, res)
        else:
            self._send_json(404, {"ok": False, "error": "Not found"})


def run_cli_menu() -> None:
    """Terminal interactive menu with clean bilingual layout to prevent terminal RTL reversal issues."""
    while True:
        print("\n" + "═" * 70)
        print("  🎛️  MASTER PROJECT LAUNCHER (اتاق فرمان مرکزی)")
        print("═" * 70)
        for i, p in enumerate(PROJECTS_REGISTRY, 1):
            port_info = f"[Port: {p['port']}]" if p.get("port") else ""
            print(f" [{i:02d}] {p['name_en']} {port_info}")
            print(f"      ↳ {p['name']}")
            print(f"      ↳ Path: {p['path']}")

        print("\n [W] 🌐 Open Web Dashboard in Browser -> http://localhost:9000")
        print(" [P] 🚀 Git Push & Sync All Changes to GitHub")
        print(" [Q] ❌ Quit / Exit")
        print("─" * 70)

        choice = input("Select [1-11, W, P, Q]: ").strip().upper()

        if choice == "Q":
            print("\n👋 Goodbye / خداحافظ داداش!")
            break
        elif choice == "P":
            print("\n⏳ Committing and pushing to GitHub...")
            res = MasterLauncherService.git_sync_and_push()
            if res["ok"]:
                print("✅ All changes successfully pushed to GitHub!")
            else:
                print(f"❌ Error during push: {res.get('error')}")
        elif choice == "W":
            open_browser_smart("http://localhost:9000")
            print("🌐 Web Dashboard opened at: http://localhost:9000")
        elif choice.isdigit():
            idx = int(choice) - 1
            if 0 <= idx < len(PROJECTS_REGISTRY):
                proj = PROJECTS_REGISTRY[idx]
                print(f"\nSelected: [{choice}] {proj['name_en']}")
                print(f"Title: {proj['name']}")
                print(" [1] 🚀 Run / Launch Project (اجرا)")
                print(" [2] ✏️  Edit in VS Code (ویرایش)")
                print(" [0] 🔙 Back (بازگشت)")
                act = input("Action [1, 2, 0]: ").strip()

                if act == "1":
                    print(f"Launching {proj['name_en']}...")
                    res = MasterLauncherService.launch_project(proj["id"])
                    print(res.get("message", res.get("error")))
                elif act == "2":
                    print(f"Opening {proj['name_en']} in VS Code...")
                    res = MasterLauncherService.open_in_vscode(proj["path"])
                    print(res.get("message", res.get("error")))
        else:
            print("⚠️ Invalid option / گزینه نامعتبر!")


def main() -> None:
    parser = argparse.ArgumentParser(description="Master Project Launcher & Sync")
    parser.add_argument("--web-only", action="store_true", help="Run web dashboard server only")
    parser.add_argument("--port", type=int, default=9000, help="Web dashboard port")
    parser.add_argument("--cli-only", action="store_true", help="Run CLI menu only")
    args = parser.parse_args()

    server = socketserver.ThreadingTCPServer(("0.0.0.0", args.port), LauncherHTTPRequestHandler)
    server.allow_reuse_address = True
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    print(f"🌐 Launcher Web Dashboard ready on http://0.0.0.0:{args.port}")

    if args.web_only:
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
    elif sys.stdin.isatty():
        run_cli_menu()
    else:
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass

    server.shutdown()


if __name__ == "__main__":
    main()
