#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SkyGround Tool Layer  |  لايهٔ ابزار + قرارداد خروجی مقيد
برای ادغام در 5-QWEN-HANDS-EYES  (DualBrainRouter)

مسئله‌ای که حل می‌کند:
    مدل مجری، به‌جای توليد فراخوانی ابزار، نثر می‌نويسد و امتناع می‌کند.

پنج لايهٔ راه‌حل:
    1) پرامپت «قابليت‌محور» به‌جای «منع‌محور»
    2) schema صريح برای هر ابزار
    3) خروجی مقيد: JSON Schema (Ollama) يا GBNF (llama.cpp)
    4) اعتبارسنجی + حلقهٔ ترميم با پيام خطای دقيق
    5) دروازهٔ ايمنی + دفتر تجربه

مرزها:
    اين فايل هيچ بخشی از مکانيزم DSA (فرمول، فرکانس، فرشتگان، چرخش) را ندارد.
    تنها يک درز (seam) با نام DSAHook برای اتصال ماژول خصوصی شما تعبيه شده است.
"""
from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import time
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

__all__ = [
    'VERSION', 'TOOLS', 'tool_names', 'ToolCall', 'ContractError',
    'build_system_prompt', 'build_output_schema', 'build_gbnf',
    'parse_tool_call', 'validate_call', 'build_repair_message',
    'Decision', 'SafetyGate', 'ExperienceLog', 'DSAHook', 'NoOpDSAHook',
    'load_dsa_hook', 'ToolRegistry', 'AgentLoop', 'SkyGroundToolLayer',
    # افزودهٔ ادغام با Qwen-Hands-Eyes
    'approver_from_guard', 'register_app_tools', 'build_tool_layer',
]

VERSION = '1.0.0'

# بک‌اسلش و کوتیشن — برای ساخت گرامر بدون دردسر escape
BS = chr(92)
Q = chr(34)

DEFAULT_WORKSPACE = os.path.expanduser('~/skyground_workspace')

# ============================================================================
# 1) قرارداد ابزارها
# ============================================================================

TOOLS: Dict[str, Dict[str, Any]] = {
    'list_dir': {
        'desc': 'فهرست‌کردن محتويات يک پوشه در فضای کاری.',
        'risk': 'low',
        'params': {
            'path': {'type': 'string', 'required': False, 'desc': 'مسير نسبی؛ پيش‌فرض ريشهٔ فضای کاری'},
        },
    },
    'read_file': {
        'desc': 'خواندن متن يک فايل داخل فضای کاری.',
        'risk': 'low',
        'params': {
            'path': {'type': 'string', 'required': True, 'desc': 'مسير نسبی فايل'},
            'max_bytes': {'type': 'integer', 'required': False, 'desc': 'حداکثر بايت؛ پيش‌فرض 20000'},
        },
    },
    'write_file': {
        'desc': 'نوشتن اتميک يک فايل (با نمايش diff). فقط داخل فضای کاری.',
        'risk': 'medium',
        'params': {
            'path': {'type': 'string', 'required': True, 'desc': 'مسير نسبی فايل'},
            'content': {'type': 'string', 'required': True, 'desc': 'محتوای کامل جديد'},
        },
    },
    'run_shell': {
        'desc': 'اجرای يک فرمان شل. به‌صورت پيش‌فرض dry_run است و فقط نمايش می‌دهد.',
        'risk': 'high',
        'params': {
            'command': {'type': 'string', 'required': True, 'desc': 'فرمان کامل'},
            'dry_run': {'type': 'boolean', 'required': False, 'desc': 'true = فقط نمايش، بدون اجرا'},
            'timeout_sec': {'type': 'integer', 'required': False, 'desc': 'پيش‌فرض 60'},
        },
    },
    'web_search': {
        'desc': 'جست‌وجو در وب و برگرداندن خلاصهٔ منابع.',
        'risk': 'medium',
        'params': {
            'query': {'type': 'string', 'required': True, 'desc': 'عبارت جست‌وجو'},
            'limit': {'type': 'integer', 'required': False, 'desc': 'تعداد نتايج؛ پيش‌فرض 5'},
        },
    },
    'screen_capture': {
        'desc': 'گرفتن تصوير از صفحهٔ نمايش (چشم) و برگرداندن مسير فايل تصوير.',
        'risk': 'low',
        'params': {
            'monitor': {'type': 'integer', 'required': False, 'desc': 'شمارهٔ مانيتور؛ پيش‌فرض 0'},
        },
    },
    'ui_action': {
        'desc': 'انجام عمل ماوس يا کيبرد روی رابط کاربری (دست).',
        'risk': 'high',
        'params': {
            'action': {'type': 'string', 'required': True, 'desc': 'click | type | key | scroll'},
            'target': {'type': 'string', 'required': False, 'desc': 'مختصات يا نام عنصر'},
            'text': {'type': 'string', 'required': False, 'desc': 'متن برای تايپ'},
        },
    },
    'remember': {
        'desc': 'ثبت يک تجربه يا واقعيت در دفتر تجربه برای استفاده‌های بعدی.',
        'risk': 'low',
        'params': {
            'text': {'type': 'string', 'required': True, 'desc': 'متن تجربه'},
            'tag': {'type': 'string', 'required': False, 'desc': 'برچسب موضوعی'},
        },
    },
    'recall': {
        'desc': 'بازيابی تجربه‌های مرتبط با يک پرس‌وجو.',
        'risk': 'low',
        'params': {
            'query': {'type': 'string', 'required': True, 'desc': 'پرس‌وجو'},
            'k': {'type': 'integer', 'required': False, 'desc': 'تعداد؛ پيش‌فرض 5'},
        },
    },
    'finish': {
        'desc': 'پايان کار و تحويل پاسخ نهايی به کاربر.',
        'risk': 'low',
        'params': {
            'answer': {'type': 'string', 'required': True, 'desc': 'پاسخ نهايی و کامل'},
        },
    },
}


def tool_names() -> List[str]:
    return list(TOOLS.keys())


@dataclass
class ToolCall:
    tool: str
    args: Dict[str, Any] = field(default_factory=dict)
    thought: str = ''

    def to_dict(self) -> Dict[str, Any]:
        return {'tool': self.tool, 'args': self.args, 'thought': self.thought}


class ContractError(Exception):
    """خروجی مدل با قرارداد ابزار سازگار نبود."""


# ============================================================================
# 2) دروازهٔ ايمنی
# ============================================================================

# مسيرهايی که هرگز نبايد خوانده يا نوشته شوند
BLOCKED_PATH = [
    r'(^|/)(\.ssh|\.aws|\.gnupg|\.kube)(/|$)',
    r'(^|/)\.config/gcloud(/|$)',
    r'(^|/)\.env(\.|$)',
    r'(^|/)id_(rsa|dsa|ecdsa|ed25519)(\.|$)',
    r'(seed|mnemonic|keystore|wallet|private[_-]?key|api[_-]?key|credential|secret)',
    r'\.(pem|key|p12|pfx|jks)$',
]

# فرمان‌هايی که هميشه رد می‌شوند
DANGEROUS_CMD = [
    r'\brm\s+(-[a-zA-Z]+\s+)*/',
    r'\bmkfs(\.|\s)',
    r'\bdd\s+if=',
    r'>\s*/dev/(sd|nvme|mmcblk)',
    r':\s*\(\s*\)\s*\{',
    r'\bchmod\s+-R\s+777\s+/',
    r'(curl|wget)[^|;&]*\|\s*(ba|z|k)?sh',
    r'\b(shutdown|reboot|halt|poweroff)\b',
    r'\bgit\s+push\b.*--force',
    r'\bgit\s+reset\s+--hard\b',
    r'\bsudo\b',
]

# فرمان‌هايی که به تأييد انسانی نياز دارند
APPROVAL_CMD = [
    r'\bgit\s+push\b',
    r'\brm\b',
    r'\bmv\b',
    r'\b(curl|wget|ssh|scp|nc|ncat|telnet)\b',
    r'\b(place_order|submit_order|trade|withdraw|transfer)\b',
    r'\bpip\s+install\b',
]

APPROVAL_TOOLS = {'write_file', 'ui_action'}


@dataclass
class Decision:
    allowed: bool
    needs_approval: bool = False
    reason: str = ''
    args: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class SafetyGate:
    """تصميم‌گير دربارهٔ مجاز بودن هر فراخوانی ابزار."""

    def __init__(
        self,
        workspace: str = DEFAULT_WORKSPACE,
        allow_root: bool = False,
        default_dry_run: bool = True,
        network_enabled: bool = True,
        require_approval_for_writes: bool = True,
    ):
        self.workspace = Path(workspace).expanduser().resolve()
        self.allow_root = allow_root
        self.default_dry_run = default_dry_run
        self.network_enabled = network_enabled
        self.require_approval_for_writes = require_approval_for_writes
        self.workspace.mkdir(parents=True, exist_ok=True)

    # --- کمکی -------------------------------------------------------------
    def _resolve(self, raw: str) -> Optional[Path]:
        try:
            p = (self.workspace / str(raw)).resolve()
        except Exception:
            return None
        if self.workspace != p and self.workspace not in p.parents:
            return None
        return p

    @staticmethod
    def _hits(text: str, patterns: List[str]) -> Optional[str]:
        for pat in patterns:
            if re.search(pat, text, re.IGNORECASE):
                return pat
        return None

    # --- اصلی -------------------------------------------------------------
    def check(self, call: ToolCall) -> Decision:
        args = dict(call.args or {})
        name = call.tool

        if name not in TOOLS:
            return Decision(False, reason='ابزار ناشناخته: ' + str(name))

        if not self.allow_root and hasattr(os, 'geteuid') and os.geteuid() == 0:
            return Decision(False, reason='اجرای ايجنت با کاربر root ممنوع است.')

        if name == 'run_shell':
            cmd = str(args.get('command', ''))
            hit = self._hits(cmd, DANGEROUS_CMD)
            if hit:
                return Decision(False, reason='فرمان پرخطر مسدود شد: ' + hit, args=args)
            args.setdefault('dry_run', self.default_dry_run)
            if self._hits(cmd, APPROVAL_CMD):
                return Decision(True, needs_approval=True,
                                reason='فرمان نيازمند تأييد: ' + cmd[:80], args=args)
            return Decision(True, args=args)

        if name in ('read_file', 'write_file', 'list_dir'):
            raw = str(args.get('path', '.') or '.')
            hit = self._hits(raw, BLOCKED_PATH)
            if hit:
                return Decision(False, reason='مسير محافظت‌شده: ' + hit, args=args)
            target = self._resolve(raw)
            if target is None:
                return Decision(False, reason='خروج از فضای کاری مجاز نيست: ' + raw, args=args)
            args['path'] = str(target)
            if name == 'write_file' and self.require_approval_for_writes:
                return Decision(True, needs_approval=True,
                                reason='نوشتن فايل نيازمند تأييد', args=args)
            return Decision(True, args=args)

        if name in ('web_search',) and not self.network_enabled:
            return Decision(False, reason='دسترسی شبکه در اين حالت غيرفعال است.', args=args)

        if name in APPROVAL_TOOLS:
            return Decision(True, needs_approval=True, reason='نيازمند تأييد', args=args)

        return Decision(True, args=args)


# ============================================================================
# 3) قرارداد خروجی: JSON Schema  +  GBNF
# ============================================================================

def build_output_schema():
    """
    JSON Schema برای پارامتر format در Ollama / guided decoding در vLLM.
    مدل مجبور می‌شود ساختار فراخوانی ابزار تولید کند؛ جایی که در آن
    نثرِ «نمی‌توانم» بگنجد، باقی نمی‌ماند.
    """
    return {
        'type': 'object',
        'properties': {
            'thought': {'type': 'string', 'description': 'استدلال کوتاه پیش از عمل'},
            'tool': {'type': 'string', 'enum': tool_names()},
            'args': {'type': 'object'},
        },
        'required': ['tool', 'args'],
        'additionalProperties': False,
    }


# گرامر عمومی JSON به سبک GBNF (سازگار با llama.cpp و Ollama raw)
_GBNF_JSON = r"""
root        ::= ws value ws
value       ::= object | array | string | number | "true" | "false" | "null"
object      ::= "{" ws ( member ( ws "," ws member )* )? ws "}"
member      ::= string ws ":" ws value
array       ::= "[" ws ( value ( ws "," ws value )* )? ws "]"
string      ::= "\"" ( [^"\\\x00-\x1f] | "\\" ( ["\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] ) )* "\""
number      ::= "-"? ( "0" | [1-9] [0-9]* ) ( "." [0-9]+ )? ( [eE] [-+]? [0-9]+ )?
ws          ::= [ \t\n\r]*
"""


def build_gbnf():
    """گرامر GBNF برای اجبار مدل به تولید فقط یک JSON object."""
    return _GBNF_JSON.strip() + chr(10)


# ============================================================================
# 4) پرامپت سیستمی «قابلیت‌محور»
# ============================================================================

_PERSONA = (
    'تو SkyGround هستی، دستیار اجرایی هادی روی دستگاه خودش.\n'
    'تو در محیط سندباکس و ایزوله اجرا می‌شوی و فقط از راه ابزارهای زیر با جهان بیرون کار می‌کنی.\n'
)


def build_system_prompt(role='executor', workspace=DEFAULT_WORKSPACE, extra=''):
    """
    نکتهٔ کلیدی: به مدل نگو «حق نداری نه بگویی».
    فقط توصیف کن که چه کسی است و چه ابزارهایی در اختیار دارد.
    توصیف قابلیت، نه منع — این تفاوت، بیشتر امتناع‌ها را از بین می‌برد.
    """
    lines = [_PERSONA]

    if role == 'executor':
        lines.append('نقش تو اجراست: درخواست را به فراخوانی ابزار تبدیل می‌کنی و نتیجه را گزارش می‌دهی.\n')
    else:
        lines.append('نقش تو برنامه‌ریزی است: مسئله را می‌شکافی، ابزار مناسب را انتخاب می‌کنی و قدم‌به‌قدم پیش می‌روی.\n')

    lines.append('فضای کاری مجاز: ' + str(workspace) + chr(10))
    lines.append('ابزارهای در اختیار تو:\n')
    for name, spec in TOOLS.items():
        params = spec.get('params', {})
        sig = ', '.join(
            p + ('*' if d.get('required') else '')
            for p, d in params.items()
        ) or '—'
        lines.append('  - ' + name + '(' + sig + ') : ' + spec['desc'] + '\n')

    lines.append(
        '\nقواعد کار:\n'
        '  ۱. هر پاسخ تو یک JSON است: {"thought": "...", "tool": "...", "args": {...}}\n'
        '  ۲. برای هر قدم فقط یک ابزار صدا بزن. بعد از دیدن نتیجه، قدم بعد را انتخاب کن.\n'
        '  ۳. عمل‌های پرمخاطره به‌صورت پیش‌فرض در حالت نمایشی (dry_run) اجرا می‌شوند.\n'
        '  ۴. اگر مسیری خارج از فضای کاری بود، درخواست دسترسی نکن؛ از کاربر راهنمایی بخواه.\n'
        '  ۵. وقتی کار تمام شد، ابزار finish را با پاسخ کامل صدا بزن.\n'
    )
    if extra:
        lines.append('\n' + extra + '\n')
    return ''.join(lines)


# ============================================================================
# 5) تجزیه‌گر خروجی مدل
# ============================================================================

_THINK_RE = re.compile(r'<think\b[^>]*>.*?</think\s*>', re.DOTALL | re.IGNORECASE)
_FENCE_RE = re.compile(r'```(?:json)?\s*(.*?)```', re.DOTALL | re.IGNORECASE)


def _extract_json_blob(text):
    """جداکردن بدنهٔ JSON از متن آزاد (شامل بلوک think مدل‌های استدلالی)."""
    if not text:
        return None
    cleaned = _THINK_RE.sub(' ', text)

    fence = _FENCE_RE.search(cleaned)
    if fence:
        cleaned = fence.group(1)

    cleaned = cleaned.strip()
    if not cleaned:
        return None

    start = cleaned.find('{')
    end = cleaned.rfind('}')
    if start == -1 or end == -1 or end <= start:
        return None
    return cleaned[start:end + 1]


def parse_tool_call(text):
    """خروجی مدل را به ToolCall تبدیل می‌کند؛ در صورت شکست ContractError می‌دهد."""
    blob = _extract_json_blob(text)
    if blob is None:
        raise ContractError('در خروجی مدل هیچ JSON‌ای پیدا نشد.')
    try:
        obj = json.loads(blob)
    except json.JSONDecodeError as e:
        raise ContractError('JSON نامعتبر: ' + str(e))
    if not isinstance(obj, dict):
        raise ContractError('خروجی باید یک JSON object باشد.')
    if 'tool' not in obj:
        raise ContractError('کلید «tool» در خروجی نیست.')
    args = obj.get('args') or {}
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except json.JSONDecodeError:
            raise ContractError('مقدار «args» رشتهٔ JSON نامعتبر است.')
    if not isinstance(args, dict):
        raise ContractError('«args» باید object باشد.')
    return ToolCall(
        tool=str(obj['tool']).strip(),
        args=args,
        thought=str(obj.get('thought', '')),
    )


def validate_call(call):
    """بررسی سازگاری فراخوانی با schema ابزار؛ فهرست خطاها را برمی‌گرداند."""
    errors = []
    spec = TOOLS.get(call.tool)
    if spec is None:
        return ['ابزار ناشناخته: ' + call.tool + ' | مجاز: ' + ', '.join(tool_names())]

    declared = spec.get('params', {})
    for pname, pspec in declared.items():
        if pspec.get('required') and pname not in call.args:
            errors.append('پارامتر لازم «' + pname + '» وجود ندارد.')

    for pname in call.args:
        if pname not in declared:
            errors.append('پارامتر ناشناخته «' + pname + '».')
            continue
        want = declared[pname].get('type')
        val = call.args[pname]
        ok = True
        if want == 'string':
            ok = isinstance(val, str)
        elif want == 'integer':
            ok = isinstance(val, int) and not isinstance(val, bool)
        elif want == 'boolean':
            ok = isinstance(val, bool)
        if not ok:
            errors.append('نوع «' + pname + '» باید ' + str(want) + ' باشد.')
    return errors


def build_repair_message(errors, original):
    """
    پیام ترمیم: خطای دقیق + schema دقیق.
    حلقهٔ ترمیم با بازخورد مشخص، بیشتر از تکرار خام پاسخ جواب می‌دهد.
    """
    schema = json.dumps(build_output_schema(), ensure_ascii=False)
    return (
        'خروجی پیشین تو با قرارداد ابزار سازگار نبود.\n'
        'خطاها:\n  - ' + '\n  - '.join(errors) + '\n\n'
        'خروجی پیشین:\n' + original[:600] + '\n\n'
        'قالب دقیق مورد انتظار:\n' + schema + '\n\n'
        'اکنون فقط و فقط یک JSON object معتبر برگردان. هیچ متن دیگری ننویس.'
    )


# ============================================================================
# 6) دفتر تجربه
# ============================================================================

class ExperienceLog:
    """
    دفتر تجربهٔ اپیزودیک (SQLite).

    تمايز مهم برای مقاله و پتنت:
      اين دفتر «لاگ داده» است، نه حافظهٔ مدل و نه بافر بازپخش.
      هيچ گراديانی از آن به وزن‌ها نمی‌رود. خروجی آن دادهٔ خام برای
      مرحلهٔ جداگانهٔ تقطير است، که تصميم جداگانه‌ای دارد.
    """

    DDL = (
        'CREATE TABLE IF NOT EXISTS experiences ('
        '  id INTEGER PRIMARY KEY AUTOINCREMENT,'
        '  ts REAL NOT NULL,'
        '  kind TEXT NOT NULL,'
        '  tag TEXT,'
        '  text TEXT NOT NULL,'
        '  meta TEXT'
        ')'
    )

    def __init__(self, path=None):
        self.path = path or os.path.join(DEFAULT_WORKSPACE, 'experience.db')
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        import sqlite3
        import threading
        self._sqlite = sqlite3
        # سرور API درخواست‌ها را در تردهای جدا اجرا می‌کند (Feet/Dashboard)، پس
        # اتصال sqlite باید بین تردها مشترک باشد و نوشتن‌ها با قفل محافظت شوند.
        self._lock = threading.Lock()
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        with self._lock:
            self.conn.execute(self.DDL)
            self.conn.commit()

    def add(self, text, tag='general', kind='note', meta=None):
        with self._lock:
            self.conn.execute(
                'INSERT INTO experiences (ts, kind, tag, text, meta) VALUES (?,?,?,?,?)',
                (time.time(), kind, tag, text, json.dumps(meta or {}, ensure_ascii=False)),
            )
            self.conn.commit()
        return True

    def search(self, query, k=5):
        """بازيابی سادهٔ کلیدواژه‌ای + ترجيح تازگی (جای توسعه با embedding)."""
        with self._lock:
            rows = self.conn.execute(
                'SELECT id, ts, kind, tag, text FROM experiences ORDER BY id DESC LIMIT 2000'
            ).fetchall()
        terms = [t for t in re.split(r'\s+', str(query).strip()) if t]
        scored = []
        now = time.time()
        for rid, ts, kind, tag, text in rows:
            hay = (text or '') + ' ' + (tag or '')
            score = sum(1 for t in terms if t and t in hay)
            if score == 0 and terms:
                continue
            age_days = max(0.0, (now - ts) / 86400.0)
            scored.append((score - 0.01 * age_days, rid, kind, tag, text, ts))
        scored.sort(reverse=True)
        out = []
        for s, rid, kind, tag, text, ts in scored[:max(1, int(k))]:
            out.append({'id': rid, 'kind': kind, 'tag': tag, 'text': text, 'ts': ts})
        return out

    def export_traces(self, out_path):
        """خروجی JSONL از تجربه‌ها؛ مادهٔ خام مرحلهٔ تقطير (جدا از آموزش زنده)."""
        with self._lock:
            rows = list(self.conn.execute(
                'SELECT id, ts, kind, tag, text, meta FROM experiences ORDER BY id'
            ))
        with open(out_path, 'w', encoding='utf-8') as f:
            for rid, ts, kind, tag, text, meta in rows:
                f.write(json.dumps(
                    {'id': rid, 'ts': ts, 'kind': kind, 'tag': tag,
                     'text': text, 'meta': json.loads(meta or '{}')},
                    ensure_ascii=False) + chr(10))
        return out_path

    def close(self):
        try:
            with self._lock:
                self.conn.close()
        except Exception:
            pass


# ============================================================================
# 7) درز اتصال DSA  (هيچ محتوايی از مکانيزم اينجا نيست)
# ============================================================================

class NoOpDSAHook:
    """
    پياده‌سازی پيش‌فرض: بی‌اثر.
    ماژول خصوصی شما اين کلاس را جایگزين می‌کند.
    """
    name = 'noop'

    def before_step(self, call, ctx):
        return call

    def after_step(self, call, result, ctx):
        return None


def load_dsa_hook():
    """
    بارگذاری ماژول خصوصی در صورت وجود.

    قرارداد: متغير محيطی SKYGROUND_DSA_MODULE = نام ماژول پايتونی
    که تابع get_hook() را عرضه می‌کند. اگر نبود، NoOp برمی‌گردد.
    """
    mod_name = os.environ.get('SKYGROUND_DSA_MODULE', '').strip()
    if not mod_name:
        return NoOpDSAHook()
    try:
        import importlib
        mod = importlib.import_module(mod_name)
        hook = mod.get_hook()
        return hook
    except Exception as e:
        import logging
        logging.getLogger('skyground.dsa').warning(
            'بارگذاری ماژول DSA ناموفق بود؛ NoOp فعال شد: ' + str(e))
        return NoOpDSAHook()


# ============================================================================
# 8) رجیستری ابزار
# ============================================================================

class ToolRegistry:
    """نگاشت نام ابزار به پياده‌سازی واقعی."""

    def __init__(self, gate=None, log=None):
        self.gate = gate or SafetyGate()
        self.log = log
        self._impl = {}
        self._register_builtins()

    def register(self, name, fn):
        if name not in TOOLS:
            raise ContractError('ابزار ثبت‌نشده در قرارداد: ' + name)
        self._impl[name] = fn
        return self

    # --- پياده‌سازی‌های پيش‌فرض -------------------------------------------
    def _register_builtins(self):
        self.register('list_dir', self._do_list_dir)
        self.register('read_file', self._do_read_file)
        self.register('write_file', self._do_write_file)
        self.register('run_shell', self._do_run_shell)
        self.register('remember', self._do_remember)
        self.register('recall', self._do_recall)
        self.register('finish', self._do_finish)
        self.register('web_search', self._do_unwired)
        self.register('screen_capture', self._do_unwired)
        self.register('ui_action', self._do_unwired)

    @staticmethod
    def _ok(**kw):
        d = {'ok': True}
        d.update(kw)
        return d

    @staticmethod
    def _fail(msg, **kw):
        d = {'ok': False, 'error': str(msg)}
        d.update(kw)
        return d

    def _do_list_dir(self, args, ctx):
        p = args.get('path') or self.gate.workspace
        entries = []
        for name in sorted(os.listdir(p)):
            full = os.path.join(p, name)
            entries.append({
                'name': name,
                'type': 'dir' if os.path.isdir(full) else 'file',
                'size': os.path.getsize(full) if os.path.isfile(full) else None,
            })
        return self._ok(path=str(p), entries=entries[:500])

    def _do_read_file(self, args, ctx):
        path = args['path']
        limit = int(args.get('max_bytes') or 20000)
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            data = f.read(limit)
        return self._ok(path=path, content=data, truncated=len(data) >= limit)

    def _do_write_file(self, args, ctx):
        path, content = args['path'], args.get('content', '')
        old = ''
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8', errors='replace') as f:
                old = f.read()
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            f.write(content)
        os.replace(tmp, path)
        import difflib
        diff = list(difflib.unified_diff(
            old.splitlines(), content.splitlines(),
            fromfile='before', tofile='after', lineterm='', n=2))
        return self._ok(path=path, bytes=len(content.encode('utf-8')),
                        diff=chr(10).join(diff[:80]))

    def _do_run_shell(self, args, ctx):
        cmd = str(args['command'])
        dry = bool(args.get('dry_run', True))
        timeout = int(args.get('timeout_sec') or 60)
        if dry:
            return self._ok(dry_run=True, command=cmd,
                            argv=shlex.split(cmd),
                            note='حالت نمایشی؛ برای اجرای واقعی dry_run=false بده.')
        try:
            proc = subprocess.run(
                shlex.split(cmd), cwd=str(self.gate.workspace),
                capture_output=True, text=True, timeout=timeout, shell=False,
            )
        except subprocess.TimeoutExpired:
            return self._fail('مهلت اجرای فرمان گذشت.', command=cmd)
        except Exception as e:
            return self._fail(str(e), command=cmd)
        return self._ok(
            dry_run=False, command=cmd, returncode=proc.returncode,
            stdout=(proc.stdout or '')[-8000:], stderr=(proc.stderr or '')[-4000:],
        )

    def _do_remember(self, args, ctx):
        if self.log is None:
            return self._fail('دفتر تجربه در دسترس نيست.')
        self.log.add(str(args['text']), tag=str(args.get('tag') or 'general'),
                     kind='agent_note', meta={'step': ctx.get('step')})
        return self._ok(stored=True)

    def _do_recall(self, args, ctx):
        if self.log is None:
            return self._fail('دفتر تجربه در دسترس نيست.')
        hits = self.log.search(str(args['query']), k=int(args.get('k') or 5))
        return self._ok(query=args['query'], hits=hits)

    def _do_finish(self, args, ctx):
        return self._ok(final=True, answer=str(args['answer']))

    def _do_unwired(self, args, ctx):
        return self._fail('اين ابزار در اين نسخه به پياده‌سازی وصل نشده است. '
                          'آن را با registry.register بشکن.')

    # --- اجرا -------------------------------------------------------------
    def _contain_path(self, call):
        """
        محافظت لايهٔ پايين: مسيرهای نسبی هميشه داخل فضای کاری حل می‌شوند و
        خروج از آن — حتی وقتی فراخوانی از دروازهٔ ايمنی رد نشده باشد — مسدود است.
        """
        args = dict(call.args or {})
        raw = str(args.get('path', '.') or '.')
        try:
            target = (self.gate.workspace / raw).resolve() if not os.path.isabs(raw) else Path(raw).resolve()
        except Exception:
            return None, 'مسير نامعتبر است: ' + raw
        if target != self.gate.workspace and self.gate.workspace not in target.parents:
            return None, 'خروج از فضای کاری مجاز نيست: ' + raw
        args['path'] = str(target)
        return args, None

    def execute(self, call, ctx):
        fn = self._impl.get(call.tool)
        if fn is None:
            return self._fail('ابزار «' + call.tool + '» پياده‌سازی ندارد.')
        if call.tool in ('read_file', 'write_file', 'list_dir'):
            args, error = self._contain_path(call)
            if error:
                return self._fail(error)
            call.args = args
        return fn(call.args, ctx)


# ============================================================================
# 9) حلقهٔ ايجنت
# ============================================================================

@dataclass
class Step:
    index: int
    call: ToolCall
    result: Dict[str, Any]
    decision: Dict[str, Any]

    def to_dict(self):
        return {'index': self.index, 'call': self.call.to_dict(),
                'result': self.result, 'decision': self.decision}


class AgentLoop:
    """
    حلقهٔ اجرا: پيام -> مدل -> تجزيه -> دروازهٔ ايمنی -> اجرا -> مشاهده -> ...

    پارامتر model_fn با امضای (prompt: str) -> str تزريق می‌شود،
    تا اين لايه مستقل از Ollama / vLLM / llama.cpp بماند.
    """

    def __init__(
        self,
        model_fn,
        registry=None,
        gate=None,
        log=None,
        hook=None,
        max_steps=8,
        max_repairs=2,
        approver=None,
        verbose=False,
    ):
        self.model_fn = model_fn
        self.gate = gate or SafetyGate()
        self.log = log
        self.registry = registry or ToolRegistry(gate=self.gate, log=log)
        self.hook = hook or NoOpDSAHook()
        self.max_steps = int(max_steps)
        self.max_repairs = int(max_repairs)
        self.approver = approver
        self.verbose = verbose
        self.steps = []

    def _log(self, msg):
        if self.verbose:
            print('[skyground] ' + str(msg))

    def _ask_model(self, prompt):
        text = self.model_fn(prompt)
        if isinstance(text, dict):
            text = text.get('response') or text.get('content') or ''
        return str(text)

    def _approve(self, call, decision):
        """دروازهٔ تأييد انسانی. پيش‌فرض: در محيط غيرتعاملی، رد می‌کند."""
        if self.approver is None:
            return False
        try:
            return bool(self.approver(call, decision))
        except Exception:
            return False

    def run(self, user_message, system_prompt=None, history=None):
        if (not self.gate.allow_root) and hasattr(os, 'geteuid') and os.geteuid() == 0:
            raise RuntimeError(
                'اجرای ايجنت با کاربر root ممنوع است. '
                'يک کاربر غيرروت بساز و ايجنت را زير آن اجرا کن '
                '(برای آزمون، SafetyGate(allow_root=True) بده).')

        system = system_prompt or build_system_prompt(workspace=str(self.gate.workspace))
        transcript = []
        self.steps = []

        if history:
            transcript.extend(history)
        transcript.append({'role': 'user', 'content': str(user_message)})

        final_answer = None
        pending_repair = None

        for i in range(self.max_steps):
            prompt = system + chr(10) + chr(10) + self._render(transcript)
            if pending_repair:
                prompt += chr(10) + chr(10) + pending_repair

            raw = self._ask_model(prompt)

            # --- تجزيه با حلقهٔ ترميم -------------------------------------
            call, errors = None, []
            try:
                call = parse_tool_call(raw)
                errors = validate_call(call)
            except ContractError as e:
                errors = [str(e)]

            if errors:
                pending_repair = build_repair_message(errors, raw)
                transcript.append({'role': 'assistant', 'content': raw})
                transcript.append({'role': 'user', 'content': pending_repair})
                if self.log:
                    self.log.add('ناسازگاری قرارداد: ' + ' | '.join(errors),
                                 tag='contract_error', kind='repair')
                continue
            pending_repair = None

            # --- درز DSA: پيش از عمل -------------------------------------
            ctx = {'step': i, 'gate': self.gate, 'log': self.log}
            call = self.hook.before_step(call, ctx) or call

            # --- دروازهٔ ايمنی --------------------------------------------
            decision = self.gate.check(call)
            if not decision.allowed:
                result = {'ok': False, 'blocked': True, 'error': decision.reason}
                self._record(transcript, call, result, decision, i)
                if self.log:
                    self.log.add('مسدود شد: ' + call.tool + ' | ' + decision.reason,
                                 tag='safety_block', kind='gate')
                continue

            call.args = decision.args or call.args

            if decision.needs_approval and not self._approve(call, decision):
                result = {'ok': False, 'denied': True,
                          'error': 'تأييد انسانی داده نشد: ' + decision.reason}
                self._record(transcript, call, result, decision, i)
                continue

            # --- اجرا ------------------------------------------------------
            try:
                result = self.registry.execute(call, ctx)
            except Exception as e:
                result = {'ok': False, 'error': 'خطای اجرا: ' + str(e)}
            result = result if isinstance(result, dict) else {'ok': True, 'value': result}

            # --- درز DSA: پس از عمل ---------------------------------------
            try:
                self.hook.after_step(call, result, ctx)
            except Exception as e:
                self._log('hook.after_step خطا داد: ' + str(e))

            self._record(transcript, call, result, decision, i)

            if self.log:
                self.log.add(
                    'قدم ' + str(i) + ': ' + call.tool + ' -> ' +
                    ('موفق' if result.get('ok') else 'ناموفق'),
                    tag='trajectory', kind='step',
                    meta={'call': call.to_dict(), 'ok': bool(result.get('ok'))},
                )

            if result.get('final'):
                final_answer = result.get('answer')
                break

        return {
            'answer': final_answer,
            'steps': [s.to_dict() for s in self.steps],
            'stopped_early': final_answer is None,
        }

    def _record(self, transcript, call, result, decision, i):
        self.steps.append(Step(i, call, result, decision.to_dict()))
        transcript.append({'role': 'assistant', 'content': json.dumps(
            call.to_dict(), ensure_ascii=False)})
        transcript.append({'role': 'tool', 'content': json.dumps(
            {'tool': call.tool, 'result': result}, ensure_ascii=False)[:4000]})

    @staticmethod
    def _render(transcript):
        out = []
        for m in transcript:
            role = {'system': 'سیستم', 'user': 'کاربر',
                    'assistant': 'دستیار', 'tool': 'ابزار'}.get(m['role'], m['role'])
            out.append('### ' + role + chr(10) + str(m['content']))
        return chr(10).join(out) + chr(10) + '### دستیار' + chr(10)


# ============================================================================
# 10) آداپتور ادغام با DualBrainRouter موجود شما
# ============================================================================

class SkyGroundToolLayer:
    """
    پوشش نازک روی DualBrainRouter شما.

    استفاده در 5-QWEN-HANDS-EYES:
        from skyground_tools import SkyGroundToolLayer

        layer = SkyGroundToolLayer(brain_router, workspace='~/skyground_workspace')
        out = layer.handle('یک اسکریپت پایتون بساز که خطاهای لاگ را بشمارد و اجرا کن')
        print(out['answer'])

    router شما همچنان کار خودش را می‌کند (مسيريابی کوئن/R1).
    اين لايه فقط قرارداد ابزار، دروازهٔ ايمنی و دفتر تجربه را اضافه می‌کند.
    """

    def __init__(self, brain_router=None, workspace=DEFAULT_WORKSPACE,
                 require_approval_for_writes=True, verbose=False, approver=None,
                 max_steps=8, max_repairs=2):
        self.router = brain_router
        self.gate = SafetyGate(workspace=workspace,
                               require_approval_for_writes=require_approval_for_writes)
        self.log = ExperienceLog(os.path.join(str(self.gate.workspace), 'experience.db'))
        self.hook = load_dsa_hook()
        self.registry = ToolRegistry(gate=self.gate, log=self.log)
        # approver: تابع (call, decision) -> bool
        # در خود برنامه با approver_from_guard() به دروازهٔ تأیید Qwen-Hands-Eyes وصل می‌شود.
        self.approver = approver
        self.loop = AgentLoop(
            model_fn=self._call_brain, registry=self.registry,
            gate=self.gate, log=self.log, hook=self.hook, verbose=verbose,
            approver=approver, max_steps=max_steps, max_repairs=max_repairs,
        )

    def _call_brain(self, prompt):
        """
        اتصال به مغز. ترتيب اولويت:
          ۱. مغز محلی تو از راه ollama (متغير محيطی SKYGROUND_OLLAMA_MODEL)
          ۲. در نبود آن، router خودت
          ۳. در نبود آن، خطای روشن
        """
        model = os.environ.get('SKYGROUND_OLLAMA_MODEL', '').strip()
        if model:
            return self._call_ollama(model, prompt)

        if self.router is not None:
            try:
                res = self.router.process(prompt, force_brain='primary')
                if isinstance(res, dict):
                    return res.get('response', '')
                return str(res)
            except Exception as e:
                raise RuntimeError('router.process شکست خورد: ' + str(e))

        raise RuntimeError(
            'هيچ مغزی متصل نيست. SKYGROUND_OLLAMA_MODEL را ست کن '
            'يا يک DualBrainRouter بده.')

    @staticmethod
    def _call_ollama(model, prompt, host='http://127.0.0.1:11434'):
        """
        فراخوانی Ollama با خروجی مقيد (format = JSON Schema).
        اين همان لايه‌ای است که نثر «نمی‌توانم» را حذف می‌کند.
        """
        import urllib.request
        body = json.dumps({
            'model': model,
            'prompt': prompt,
            'stream': False,
            'format': build_output_schema(),
            'options': {'temperature': 0.2, 'num_ctx': 8192},
        }).encode('utf-8')
        req = urllib.request.Request(
            host.rstrip('/') + '/api/generate', data=body,
            headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        return data.get('response', '')

    def handle(self, user_message, system_prompt=None, history=None):
        return self.loop.run(user_message, system_prompt=system_prompt, history=history)

    def catalog(self):
        """فهرست ابزارهای در دسترس برای نمایش در داشبورد/API."""
        return {
            'version': VERSION,
            'workspace': str(self.gate.workspace),
            'tools': [
                {'name': name, 'desc': spec.get('desc', ''), 'risk': spec.get('risk', 'low'),
                 'params': sorted((spec.get('params') or {}).keys())}
                for name, spec in TOOLS.items()
            ],
        }

    def close(self):
        self.log.close()


# ============================================================================
# خودآزمايی
# ============================================================================

def _selftest():
    import tempfile
    tmp = tempfile.mkdtemp(prefix='skyground_test_')
    gate = SafetyGate(workspace=tmp, allow_root=True)
    log = ExperienceLog(os.path.join(tmp, 'exp.db'))

    calls = {'n': 0}

    def model(prompt):
        calls['n'] += 1
        if calls['n'] == 1:
            return '```json\n{"thought":"ساخت فايل","tool":"write_file","args":{"path":"notes.txt","content":"سلام دنیا"}}\n```'
        return json.dumps({'thought': 'پایان', 'tool': 'finish',
                           'args': {'answer': 'فايل ساخته شد.'}}, ensure_ascii=False)

    loop = AgentLoop(model, gate=gate, log=log,
                     approver=lambda c, d: True, verbose=False)
    out = loop.run('يک فايل يادداشت بساز')
    assert out['answer'] == 'فايل ساخته شد.', out
    assert os.path.exists(os.path.join(tmp, 'notes.txt'))

    # ۱) خروجی با think block و متن اضافی
    c = parse_tool_call('گفتم که... <think>hmm</think>\n{"tool":"list_dir","args":{}}')
    assert c.tool == 'list_dir'

    # ۲) اعتبارسنجی: پارامتر لازم غايب
    assert validate_call(ToolCall('read_file', {}))

    # ۳) دروازهٔ ايمنی: مسير محافظت‌شده
    d = gate.check(ToolCall('read_file', {'path': '../../.ssh/id_rsa'}))
    assert not d.allowed, d

    # ۴) دروازهٔ ايمنی: فرمان پرخطر
    d = gate.check(ToolCall('run_shell', {'command': 'rm -rf /'}))
    assert not d.allowed, d

    # ۵) خروج از فضای کاری
    d = gate.check(ToolCall('write_file', {'path': '/etc/passwd', 'content': 'x'}))
    assert not d.allowed, d

    # ۶) پيش‌فرض dry_run
    d = gate.check(ToolCall('run_shell', {'command': 'ls -la'}))
    assert d.allowed and d.args.get('dry_run') is True, d

    # ۷) دفتر تجربه
    log.add('تست حافظه', tag='test')
    hits = log.search('حافظه', k=3)
    assert hits and 'حافظه' in hits[0]['text'], hits

    # ۸) حلقهٔ ترميم: مدل اول خراب می‌دهد
    seq = ['{این JSON نیست', json.dumps({'tool': 'finish', 'args': {'answer': 'ترميم شد'}})]
    st = {'i': 0}

    def flaky(prompt):
        v = seq[min(st['i'], len(seq) - 1)]
        st['i'] += 1
        return v

    out2 = AgentLoop(flaky, gate=gate, log=log).run('تست ترميم')
    assert out2['answer'] == 'ترميم شد', out2

    # ۹) GBNF و schema ساخته می‌شوند
    assert 'root' in build_gbnf() and 'enum' in json.dumps(build_output_schema())

    # ۱۰) hook بی‌اثر
    assert load_dsa_hook().name == 'noop'

    log.close()
    print('همهٔ ۱۰ آزمون گذشت. نسخهٔ ' + VERSION)


if __name__ == '__main__':
    _selftest()


# ============================================================================
# 11) اتصال به خود برنامه (Qwen-Hands-Eyes / SkyGround OS)
#     این بخش «افزودهٔ ادغام» است: لایهٔ ابزار را به دروازهٔ تأیید، چشم، دست و
#     موتور جست‌وجوی همین برنامه وصل می‌کند تا فراخوانی ابزارها واقعی شوند.
# ============================================================================

# نگاشت ریسک ابزار به سطوح ریسک ApprovalGuard خودِ برنامه
_RISK_LEVELS = {'low': 'low', 'medium': 'medium', 'high': 'high'}


def approver_from_guard(guard, cli_fallback=None, timeout_sec=120.0):
    """
    تبدیل دروازهٔ تأیید برنامه (core.approval_guard.ApprovalGuard) به approver
    لایهٔ ابزار.

    نتیجه: هر عمل پرمخاطره در همان صف تأیید داشبورد/API برنامه ثبت می‌شود
    (GET /api/v1/approvals و POST /api/v1/approvals/resolve) و تا تأیید نشدن،
    ابزار اجرا نمی‌شود. اگر CLI فعال باشد، همان‌جا هم سوال می‌کند.
    """
    def _approve(call: ToolCall, decision: Decision) -> bool:
        spec = TOOLS.get(call.tool, {})
        risk = _RISK_LEVELS.get(str(spec.get('risk', 'medium')).lower(), 'medium')
        details = {'tool': call.tool, 'args': call.args, 'reason': decision.reason}
        if call.tool == 'run_shell':
            details['command'] = str((call.args or {}).get('command', ''))
        if call.tool == 'write_file':
            details['path'] = str((call.args or {}).get('path', ''))
        try:
            return bool(guard.request_approval(
                category='skyground_tool',
                title='ابزار ' + str(call.tool) + ' نیاز به تأیید دارد',
                details=details,
                risk_level=risk,
                cli_fallback=cli_fallback,
                timeout_sec=timeout_sec,
            ))
        except Exception:
            # در صورت خطای دروازهٔ تأیید، پیش‌فرض «تأیید نشد» است (امن‌تر)
            return False

    return _approve


def register_app_tools(layer, web_operator=None, screen_capture=None,
                       input_controller=None):
    """
    ابزارهایی که در این پکیج «وصل‌نشده» بودند را به زیرسیستم‌های خود برنامه وصل می‌کند:

      web_search    -> hands.web_operator.WebOperator.search
      screen_capture-> eyes.screen_capture.ScreenCaptureEngine.capture_screen
      ui_action     -> hands.input_controller.InputController (click/type/key/scroll)

    هر زیرسیستم که None باشد، همان ابزار «وصل‌نشده» می‌ماند و خطای روشن می‌دهد.
    """
    if web_operator is not None:
        def _web_search(args, ctx):
            query = str(args.get('query', '')).strip()
            limit = int(args.get('limit') or 5)
            res = web_operator.search(query, max_results=limit)
            if not res.get('ok'):
                return {'ok': False, 'error': res.get('error', 'جست‌وجو شکست خورد')}
            return {'ok': True, 'query': query, 'results': res.get('results', [])}
        layer.registry.register('web_search', _web_search)

    if screen_capture is not None:
        def _screen_capture(args, ctx):
            monitor = int(args.get('monitor') or 0) + 1  # mss از ۱ می‌شمارد
            snap = screen_capture.capture_screen(monitor_idx=max(1, monitor), save_file=True)
            if not snap.get('ok'):
                return {'ok': False, 'error': snap.get('error', 'گرفتن تصویر شکست خورد')}
            return {'ok': True, 'path': snap.get('saved_path') or snap.get('file_path'),
                    'width': snap.get('width'), 'height': snap.get('height')}
        layer.registry.register('screen_capture', _screen_capture)

    if input_controller is not None:
        def _ui_action(args, ctx):
            action = str(args.get('action', '')).strip().lower()
            text = str(args.get('text') or '')
            target = str(args.get('target') or '')
            if action == 'click':
                coords = [int(p) for p in re.findall(r'-?\d+', target)[:2]]
                if len(coords) == 2:
                    return input_controller.click(coords[0], coords[1])
                return input_controller.click()
            if action == 'type':
                return input_controller.type_text(text or target)
            if action == 'key':
                keys = [k for k in re.split(r'[+\s]+', text or target) if k]
                if not keys:
                    return {'ok': False, 'error': 'کلید مشخص نشده است.'}
                return input_controller.hotkey(*keys)
            if action == 'scroll':
                amount = int(re.findall(r'-?\d+', text or target or '3')[0])
                return input_controller.scroll(amount)
            return {'ok': False, 'error': 'عمل نامعتبر: ' + action}
        layer.registry.register('ui_action', _ui_action)

    return layer


def build_tool_layer(brain_router=None, workspace=None, approval_guard=None,
                     web_operator=None, screen_capture=None, input_controller=None,
                     require_approval_for_writes=True, verbose=False,
                     cli_fallback=None, max_steps=8):
    """
    ساخت لایهٔ ابزار آمادهٔ استفاده در برنامه:

        layer = build_tool_layer(brain_router=router, workspace=config.workspace_root,
                                 approval_guard=guard, web_operator=web_operator,
                                 screen_capture=screen_capture,
                                 input_controller=input_controller)
        out = layer.handle('لاگ‌ها را بشمار و خلاصه بده')
        print(out['answer'])

    اگر approval_guard داده شود، همهٔ عمل‌های پرمخاطره از صف تأیید خود برنامه
    عبور می‌کنند. اگر ندهی، دروازهٔ تأیید داخلی لایه (رد پیش‌فرض) فعال است.
    """
    approver = approver_from_guard(approval_guard, cli_fallback=cli_fallback) if approval_guard else None
    layer = SkyGroundToolLayer(
        brain_router=brain_router,
        workspace=workspace or DEFAULT_WORKSPACE,
        require_approval_for_writes=require_approval_for_writes,
        verbose=verbose,
        approver=approver,
        max_steps=max_steps,
    )
    return register_app_tools(
        layer,
        web_operator=web_operator,
        screen_capture=screen_capture,
        input_controller=input_controller,
    )
