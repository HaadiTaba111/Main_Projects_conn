"""پارامترهای نگهداشت DSA (λ، γ، w_min) — بدون هیچ مقدار محرمانه‌ای در کد.

ترتیب خواندن برای هر کلید:
  1. متغیر محیطی:  DSA_LAMBDA ، DSA_GAMMA ، DSA_MIN_WEIGHT
  2. فایل گاوصندوق: <DSA_VAULT_DIR>/params/dsa_params.json
     (اگر DSA_VAULT_DIR تنظیم نشده باشد، نزدیک‌ترین پوشهٔ `.dsa_vault` بالای این فایل جستجو می‌شود)

اگر هیچ‌کدام مقدار نداشته باشند، DsaParamsError پرتاب می‌شود؛ مقدار پیش‌فرض وجود ندارد.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Mapping, Optional

ENV_KEYS = {"lambda": "DSA_LAMBDA", "gamma": "DSA_GAMMA", "min_weight": "DSA_MIN_WEIGHT"}
VAULT_RELATIVE_FILE = Path("params") / "dsa_params.json"


class DsaParamsError(RuntimeError):
    """پارامترهای DSA پیدا نشدند یا نامعتبرند."""


def find_vault_dir(start: Optional[Path] = None, environ: Optional[Mapping[str, str]] = None) -> Optional[Path]:
    env = os.environ if environ is None else environ
    configured = env.get("DSA_VAULT_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()
    here = (start or Path(__file__)).resolve()
    for parent in [here.parent, *here.parents]:
        candidate = parent / ".dsa_vault"
        if candidate.is_dir():
            return candidate
    return None


def _validated(key: str, raw: object, source: str) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise DsaParamsError(f"مقدار {key} از {source} عددی نیست.") from exc
    if not math.isfinite(value) or value < 0:
        raise DsaParamsError(f"مقدار {key} از {source} نامعتبر است.")
    return value


def load_dsa_params(environ: Optional[Mapping[str, str]] = None, vault_dir: Optional[Path] = None) -> dict:
    """بازگرداندن {'lambda': float, 'gamma': float, 'min_weight': float}."""
    env = os.environ if environ is None else environ
    vault_file = None
    vault_values: dict = {}
    base = vault_dir if vault_dir is not None else find_vault_dir(environ=env)
    if base is not None and (Path(base) / VAULT_RELATIVE_FILE).is_file():
        vault_file = Path(base) / VAULT_RELATIVE_FILE
        try:
            loaded = json.loads(vault_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise DsaParamsError(f"فایل پارامترهای DSA خوانده نشد: {vault_file}") from exc
        if not isinstance(loaded, dict):
            raise DsaParamsError(f"ساختار فایل پارامترهای DSA نامعتبر است: {vault_file}")
        vault_values = loaded

    result = {}
    missing = []
    for key, env_name in ENV_KEYS.items():
        if env.get(env_name, "").strip():
            result[key] = _validated(key, env[env_name].strip(), f"متغیر {env_name}")
        elif key in vault_values:
            result[key] = _validated(key, vault_values[key], f"گاوصندوق ({vault_file})")
        else:
            missing.append(f"{env_name} یا کلید «{key}» در گاوصندوق")
    if missing:
        raise DsaParamsError(
            "پارامترهای DSA تنظیم نشده‌اند: " + "؛ ".join(missing)
            + ". گاوصندوق را در .dsa_vault/params/dsa_params.json قرار دهید یا متغیرهای محیطی را تنظیم کنید."
        )
    return result
