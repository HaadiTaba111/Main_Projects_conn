#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
prepare_poet_tasks.py  |  پل بین دیتاست مغز شاعر و آموزش پیوسته

دیتاست مغز شاعر یک فایل JSONL با کلیدهای task_id/category/instruction/input/output است.
`poet_continual_sft.py` برای هر تسک یک فایل جدا می‌خواهد. این اسکریپت:

  ۱. دیتاست اصلی را می‌خواند (پیش‌فرض: datasets/persian_poet_satire_sft.jsonl)
  ۲. بر اساس `category` به فایل‌های تسک تقسیم می‌کند -> continual/data/<slug>.jsonl
     هر خط: {"instruction": ..., "response": ...}
  ۳. یک config آماده می‌سازد -> continual/config.poet.json
     (تسک‌ها، ترتیب آموزش، پوشه خروجی، مسیر ماتریس R)

اجرا:
    python3 prepare_poet_tasks.py
    python3 prepare_poet_tasks.py --dataset datasets/persian_poet_satire_sft.jsonl
    python3 prepare_poet_tasks.py --selftest

بعد از آن:
    python3 poet_continual_sft.py --config config.poet.json
    python3 continual_eval.py out/results.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from typing import Any, Dict, List, Optional

HERE = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(HERE)
DEFAULT_DATASET = os.path.join(APP_DIR, "datasets", "persian_poet_satire_sft.jsonl")
DEFAULT_DATA_DIR = os.path.join(HERE, "data")
DEFAULT_CONFIG = os.path.join(HERE, "config.poet.json")

__all__ = ["slugify", "load_dataset", "group_by_task", "write_task_files",
           "build_config", "prepare", "main", "VERSION"]

VERSION = "1.0.0"

# ترتیب آموزش پیوسته: از دانش پایدار (شعر کلاسیک) به سبک‌های شخصی و داده‌ی تازه‌ی کاربر.
# هر دسته‌ای که اینجا نباشد، ته لیست و به ترتیب الفبا آموزش داده می‌شود.
TASK_ORDER = [
    "classical_poetry",
    "mystical_rumi",
    "proverbs_wisdom",
    "satire_humor",
    "human_feedback_correction",
    "web_knowledge",
]

TASK_TITLES = {
    "classical_poetry": "شعر کلاسیک (سعدی/حافظ)",
    "mystical_rumi": "شعر عرفانی (مولانا)",
    "proverbs_wisdom": "ضرب‌المثل و حکمت",
    "satire_humor": "طنز و طنزپردازی (عبید/دهخدا)",
    "human_feedback_correction": "تصحیح بازخورد کاربر",
    "web_knowledge": "دانش وب",
}

SLUG_RE = re.compile(r"[^a-z0-9_]+")


def slugify(name: str, fallback: str = "task") -> str:
    """نام دسته را به نام امن فایل تبدیل می‌کند (فارسی هم قابل قبول است)."""
    text = str(name or "").strip().lower()
    if not text:
        return fallback
    ascii_slug = SLUG_RE.sub("_", text).strip("_")
    if ascii_slug:
        return ascii_slug
    # دسته‌های فارسی: فاصله‌ها را به _ تبدیل کن و بقیه را نگه دار
    return re.sub(r"[\s/\\]+", "_", text).strip("_") or fallback


def load_dataset(path: str) -> List[Dict[str, Any]]:
    """خواندن JSONL دیتاست؛ خطوط خراب بی‌صدا رد می‌شوند."""
    records: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                print(f"  ⚠️ خط {line_no} JSON نامعتبر بود؛ رد شد.")
                continue
            if isinstance(rec, str):
                rec = {"category": "general", "instruction": "", "output": rec}
            answer = (rec.get("output") or rec.get("response")
                      or rec.get("answer") or rec.get("text") or "")
            if not str(answer).strip():
                continue
            rec["_answer"] = str(answer)
            rec["_instruction"] = str(rec.get("instruction")
                                      or rec.get("prompt") or rec.get("input") or "")
            rec.setdefault("category", "general")
            records.append(rec)
    return records


def group_by_task(records: List[Dict[str, Any]]) -> "Dict[str, List[Dict[str, Any]]]":
    """گروه‌بندی بر اساس دسته با ترتیب آموزش ثابت."""
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for rec in records:
        groups.setdefault(slugify(rec.get("category")), []).append(rec)

    def sort_key(name: str):
        try:
            return (0, TASK_ORDER.index(name))
        except ValueError:
            return (1, name)

    return {name: groups[name] for name in sorted(groups, key=sort_key)}


def write_task_files(groups, data_dir: str = DEFAULT_DATA_DIR) -> List[Dict[str, str]]:
    """نوشتن هر تسک در یک فایل JSONL با کلیدهای instruction/response."""
    os.makedirs(data_dir, exist_ok=True)
    tasks: List[Dict[str, str]] = []
    for name, rows in groups.items():
        path = os.path.join(data_dir, name + ".jsonl")
        with open(path, "w", encoding="utf-8") as f:
            for rec in rows:
                f.write(json.dumps(
                    {"instruction": rec["_instruction"], "response": rec["_answer"]},
                    ensure_ascii=False) + "\n")
        tasks.append({
            "name": TASK_TITLES.get(name, name),
            "file": os.path.relpath(path, HERE).replace(os.sep, "/"),
            "source_category": name,
            "rows": len(rows),
        })
    return tasks


def build_config(tasks, dataset: str, data_dir: str = DEFAULT_DATA_DIR,
                 extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """ساخت config آماده برای poet_continual_sft.py."""
    def portable(path: str) -> str:
        """مسیر نسبی به ریشهٔ برنامه تا config روی هر دستگاهی (Termux/PC) کار کند."""
        try:
            rel = os.path.relpath(path, APP_DIR)
        except ValueError:
            return path
        return path if rel.startswith("..") else rel.replace(os.sep, "/")

    cfg: Dict[str, Any] = {
        "_comment": "ساخته‌شده با prepare_poet_tasks.py — آموزش پیوسته مغز شاعر (از ریشهٔ همین پوشه اجرا کنید)",
        "dataset_source": portable(dataset),
        "base_model": "Qwen/Qwen2.5-1.5B-Instruct",
        "output_dir": portable(os.path.join(HERE, "out")),
        "matrix_out": portable(os.path.join(HERE, "results.json")),
        "tasks": [
            {"name": t["name"], "file": portable(os.path.normpath(os.path.join(HERE, t["file"])))}
            for t in tasks
        ],
        "epochs": 2,
        "batch_size": 1,
        "grad_accum": 8,
        "lr": 0.0002,
        "max_length": 512,
        "load_in_4bit": True,
        "lora_r": 16,
        "lora_alpha": 32,
        "lora_dropout": 0.05,
        "bf16": True,
        "attention_hook": None,
    }
    if extra:
        cfg.update(extra)
    return cfg


def prepare(dataset: str = DEFAULT_DATASET, data_dir: str = DEFAULT_DATA_DIR,
            config_path: str = DEFAULT_CONFIG, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """کل فرایند آماده‌سازی: خواندن، تقسیم، نوشتن config."""
    if not os.path.isfile(dataset):
        raise FileNotFoundError("دیتاست پیدا نشد: " + dataset)
    records = load_dataset(dataset)
    if not records:
        raise ValueError("دیتاست خالی است: " + dataset)
    groups = group_by_task(records)
    tasks = write_task_files(groups, data_dir=data_dir)
    cfg = build_config(tasks, dataset, data_dir=data_dir, extra=extra)
    os.makedirs(os.path.dirname(config_path) or ".", exist_ok=True)
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    return {"records": len(records), "tasks": tasks, "config": config_path}


def _selftest() -> int:
    tmp = tempfile.mkdtemp(prefix="poet_prepare_")
    sample = os.path.join(tmp, "sample.jsonl")
    with open(sample, "w", encoding="utf-8") as f:
        f.write(json.dumps({"category": "humor_joke", "instruction": "یک جوک بگو",
                            "output": "جوک اول"}, ensure_ascii=False) + "\n")
        f.write(json.dumps({"category": "classical_poetry", "instruction": "یک بیت بگو",
                            "output": "بیت اول"}, ensure_ascii=False) + "\n")
        f.write(json.dumps({"category": "humor_joke", "instruction": "جوک بعدی",
                            "output": "جوک دوم"}, ensure_ascii=False) + "\n")
        f.write("{این JSON نیست\n")
        f.write(json.dumps({"category": "classical_poetry", "instruction": "بی‌پاسخ",
                            "output": ""}, ensure_ascii=False) + "\n")

    result = prepare(dataset=sample,
                     data_dir=os.path.join(tmp, "data"),
                     config_path=os.path.join(tmp, "config.poet.json"))
    assert result["records"] == 3, result
    # ترتیب آموزش: شعر کلاسیک قبل از جوک
    assert [t["source_category"] for t in result["tasks"]] == ["classical_poetry", "humor_joke"], result["tasks"]

    with open(result["config"], encoding="utf-8") as f:
        cfg = json.load(f)
    assert len(cfg["tasks"]) == 2 and "شعر کلاسیک" in cfg["tasks"][0]["name"], cfg

    # فایل‌های تسک باید با خوانندهٔ poet_continual_sft خوانده شوند
    sys.path.insert(0, HERE)
    from poet_continual_sft import read_jsonl, load_tasks
    rows = read_jsonl(cfg["tasks"][1]["file"])
    assert rows and rows[0]["response"] == "جوک اول", rows
    tasks = load_tasks(cfg["tasks"])
    assert len(tasks) == 2 and tasks[0]["train"], tasks

    print("prepare_poet_tasks selftest OK — نسخهٔ " + VERSION)
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="آماده‌سازی تسک‌های آموزش پیوسته مغز شاعر")
    ap.add_argument("--dataset", default=DEFAULT_DATASET, help="مسیر دیتاست JSONL")
    ap.add_argument("--data-dir", default=DEFAULT_DATA_DIR, help="پوشه فایل‌های تسک")
    ap.add_argument("--config", dest="config_path", default=DEFAULT_CONFIG, help="مسیر config خروجی")
    ap.add_argument("--limit-per-task", type=int, default=None, help="سقف خطوط هر تسک")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args(argv)

    if args.selftest:
        return _selftest()

    extra = {"limit": args.limit_per_task} if args.limit_per_task else None
    try:
        result = prepare(dataset=args.dataset, data_dir=args.data_dir,
                         config_path=args.config_path, extra=extra)
    except (FileNotFoundError, ValueError) as e:
        print("❌ " + str(e))
        return 1

    print("✅ آماده‌سازی انجام شد: " + str(result["records"]) + " نمونه در "
          + str(len(result["tasks"])) + " تسک")
    for task in result["tasks"]:
        print("   • " + task["name"] + " (" + task["source_category"] + "): "
              + str(task["rows"]) + " نمونه -> " + task["file"])
    print("\nconfig ساخته شد: " + result["config"])
    print("گام بعد (از ریشهٔ برنامه):")
    print("   python3 continual/poet_continual_sft.py --config continual/config.poet.json")
    print("   python3 continual/continual_eval.py continual/results.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
