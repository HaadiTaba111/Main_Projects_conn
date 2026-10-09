#!/usr/bin/env python3
"""
📊 Crypto Trades & State Manager CLI Tool (ابزار مدیریت و استخراج معاملات)
-------------------------------------------------------------------------
طراح: هادی طباطبایی (TaHa111)

دستورات:
  python3 tools/manage_trades.py --stats          (نمایش آمار و کالبدشکافی دقیق سود/ضرر)
  python3 tools/manage_trades.py --export         (خروجی گرفتن فایل JSON کامل معاملات)
  python3 tools/manage_trades.py --import file.json (تزریق و بارگذاری فایل JSON)
"""

import os
import sys
import json
import glob
import argparse
from datetime import datetime


RESULTS_DIR = os.path.join(os.path.dirname(__file__), "..", "apps", "futures-scalp-lab", "results")


def load_all_jsonl_trades():
    trades = []
    jsonl_files = glob.glob(os.path.join(RESULTS_DIR, "trades_*.jsonl"))
    for fpath in jsonl_files:
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        trades.append(json.loads(line))
        except Exception as e:
            print(f"⚠️ خطا در خواندن {fpath}: {e}")
    return trades


def print_detailed_stats():
    trades = load_all_jsonl_trades()
    print("=" * 70)
    print("  📊 گزارش کالبدشکافی و اعتبارسنجی معاملات تریدینگ")
    print("=" * 70)

    if not trades:
        print("ℹ️ هیچ فایل تریدی در پوشه results یافت نشد.")
        print(f"مسیر بررسی: {RESULTS_DIR}")
        return

    total_count = len(trades)
    winning_trades = [t for t in trades if float(t.get("pnl", t.get("net_pnl", 0))) > 0]
    losing_trades = [t for t in trades if float(t.get("pnl", t.get("net_pnl", 0))) < 0]

    total_pnl = sum(float(t.get("pnl", t.get("net_pnl", 0))) for t in trades)
    total_fees = sum(float(t.get("fee", t.get("fees", 0))) for t in trades)
    win_rate = (len(winning_trades) / total_count * 100) if total_count > 0 else 0

    print(f"📈 کل معاملات ثبت‌شده: {total_count}")
    print(f"🏆 معاملات برنده: {len(winning_trades)} | ❌ معاملات بازنده: {len(losing_trades)}")
    print(f"🎯 وین‌ریت خالص (Win-rate): {win_rate:.1f}%")
    print(f"💰 مجموع سود/ضرر خالص (Net PnL): {total_pnl:+.3f} USDT")
    print(f"💸 کل کارمزد پرداخت‌شده به صرافی: {total_fees:,.3f} USDT")
    print("-" * 70)

    # تفکیک دلایل خروج
    reasons = {}
    for t in trades:
        r = t.get("reason", t.get("exit_reason", "نامشخص"))
        reasons[r] = reasons.get(r, 0) + 1

    print("🛑 تفکیک دلایل بسته شدن معاملات:")
    for r, count in reasons.items():
        print(f"   • {r}: {count} معامله ({(count/total_count)*100:.1f}%)")

    print("-" * 70)
    print("🔍 لیست ۱۰ معامله آخر:")
    for t in trades[-10:]:
        pnl = float(t.get("pnl", t.get("net_pnl", 0)))
        color_sym = "🟢" if pnl >= 0 else "🔴"
        sym = t.get("symbol", "BTCUSDT")
        side = t.get("side", t.get("direction", "LONG"))
        entry = t.get("entry", 0)
        exit_p = t.get("exit", t.get("close", 0))
        reason = t.get("reason", "---")
        print(f"   {color_sym} {sym:<9} | {side:<5} | ورود: {entry:,.2f} ➔ خروج: {exit_p:,.2f} | PnL: {pnl:+.3f}$ | علت: {reason}")
    print("=" * 70)


def export_trades_to_json(output_path="trades_export.json"):
    trades = load_all_jsonl_trades()
    export_payload = {
        "exported_at": datetime.utcnow().isoformat(),
        "total_trades": len(trades),
        "trades": trades
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(export_payload, f, ensure_ascii=False, indent=2)
    print(f"✅ فایل خروجی کامل با {len(trades)} معامله در مسیر زیر ذخیره شد:\n👉 {os.path.abspath(output_path)}")


def import_trades_from_json(input_path):
    if not os.path.exists(input_path):
        print(f"❌ فایل {input_path} پیدا نشد!")
        return
    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    trades = data if isinstance(data, list) else data.get("trades", [])
    out_file = os.path.join(RESULTS_DIR, f"trades_imported_{int(time.time())}.jsonl")
    with open(out_file, "w", encoding="utf-8") as f:
        for t in trades:
            f.write(json.dumps(t, ensure_ascii=False) + "\n")
    print(f"✅ تعداد {len(trades)} معامله با موفقیت در سیستم تزریق شد:\n👉 {out_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Crypto Trades & State Manager")
    parser.add_argument("--stats", action="store_true", help="نمایش آمار و گزارش معاملات")
    parser.add_argument("--export", type=str, nargs="?", const="trades_export.json", help="خروجی گرفتن فایل JSON")
    parser.add_argument("--import-file", type=str, dest="import_file", help="تزریق فایل JSON معاملات")

    args = parser.parse_args()

    if args.import_file:
        import_trades_from_json(args.import_file)
    elif args.export:
        export_trades_to_json(args.export)
    else:
        print_detailed_stats()
