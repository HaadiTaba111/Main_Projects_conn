import os
import re
import json
import time
import math
import subprocess
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

from backend.ffmpeg_utils import get_ffmpeg_exe
from backend.effects.audio import detect_beat_times
from backend.effects.registry import render_effect_layers

# فونت‌های مورد استفاده برای اندازه‌گیری متن (باید دقیقاً با فونت‌های استفاده‌شده در ASS یکی باشند)
FONT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static", "fonts"))
PERSIAN_FONT_PATH = os.path.join(FONT_DIR, "Vazirmatn.ttf")
ENGLISH_FONT_PATH_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def _resolve_english_font_path():
    for p in ENGLISH_FONT_PATH_CANDIDATES:
        if os.path.exists(p):
            return p
    return PERSIAN_FONT_PATH


ENGLISH_FONT_PATH = _resolve_english_font_path()


class RenderCancelled(RuntimeError):
    """Raised when a render is stopped on request, not because of an encoder failure."""


class RenderEngine:
    def __init__(self, project, project_dir, output_path, progress_callback=None):
        self.project = project
        self.project_dir = project_dir
        self.output_path = output_path
        self.progress_callback = progress_callback or (lambda pct, msg: None)
        self.process = None  # subprocess handle, set while an external encoder runs
        self.cancel_requested = False

    def render(self):
        raise NotImplementedError("Render method must be implemented by subclasses")

    def cancel(self):
        """Stop a running encoder process (idempotent; safe from another thread)."""
        self.cancel_requested = True
        process = self.process
        if process is not None and process.poll() is None:
            try:
                process.terminate()
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
            except OSError:
                pass


_PERSIAN_CHAR_RE = re.compile(r'[\u0600-\u06FF\u200C\u200F]')


def _contains_persian_chars(text):
    """تشخیص اینکه یک رشته حاوی حروف فارسی/عربی است یا نه."""
    return bool(_PERSIAN_CHAR_RE.search(text or ""))


def _split_bilingual_line(raw_text):
    """جدا کردن متن دوزبانه‌ی یک خط لیریکس (جدا شده با /) به دو بخش «فارسی» و «انگلیسی»،
    مستقل از ترتیب نوشتن کاربر در کادر لیریکس (تشخیص با بررسی وجود حروف فارسی/عربی).
    این دقیقاً همان منطق تابع splitBilingualLine در studio.html (سمت مرورگر) است."""
    parts = raw_text.split('/')
    if len(parts) == 1:
        only = parts[0].strip()
        if _contains_persian_chars(only):
            return only, ""
        return "", only
    first = parts[0].strip()
    rest = "/".join(parts[1:]).strip()
    if _contains_persian_chars(first):
        return first, rest
    elif _contains_persian_chars(rest):
        return rest, first
    return first, rest


def _wrap_words_to_lines(font, words, max_width):
    """شکستن یک لیست کلمه به خطوطی که هرکدام حداکثر max_width پیکسل عرض دارند."""
    lines = []
    cur = []
    for w in words:
        test_line = ' '.join(cur + [w])
        if cur and font.getlength(test_line) > max_width:
            lines.append(cur)
            cur = [w]
        else:
            cur.append(w)
    if cur:
        lines.append(cur)
    return lines


def _fit_words_to_lines(font_path, words, max_width, max_lines, base_size, min_size):
    """پیدا کردن بزرگ‌ترین اندازه فونت که متن را حداکثر در max_lines خط جا می‌کند."""
    if not words:
        return [], base_size
    size = base_size
    lines = []
    while size >= min_size:
        font = ImageFont.truetype(font_path, size)
        lines = _wrap_words_to_lines(font, words, max_width)
        if len(lines) <= max_lines:
            break
        size -= 2
    if len(lines) > max_lines:
        merged = []
        for l in lines[max_lines - 1:]:
            merged.extend(l)
        lines = lines[:max_lines - 1] + [merged]
    return lines, size


class FFmpegRenderer(RenderEngine):
    def _hex_to_ass_color(self, hex_color, alpha=0):
        """hex_color مثل #FFF000 را به فرمت رنگ ASS تبدیل می‌کند: &HAABBGGRR&
        alpha بین 0 (کاملاً کدر) تا 255 (کاملاً شفاف) است."""
        clean = str(hex_color).replace('#', '')
        if len(clean) == 6:
            r, g, b = clean[0:2], clean[2:4], clean[4:6]
        else:
            r, g, b = "FF", "FF", "FF"
        a = f"{max(0, min(255, int(alpha))):02X}"
        return f"&H{a}{b}{g}{r}&"

    def _format_ass_time(self, sec):
        sec = max(0.0, float(sec))
        h = int(sec // 3600)
        m = int((sec % 3600) // 60)
        s = int(sec % 60)
        cs = int(round((sec - int(sec)) * 100))
        return f"{h:01d}:{m:02d}:{s:02d}.{cs:02d}"

    def _build_karaoke_text(self, words, total_cs, min_cs_per_word=8):
        """ساخت متن کارائوکه ASS با تگ‌های \\k روی هر کلمه.
        total_cs: کل زمان موجود (به صدم ثانیه) برای پخش تمام کلمات این بخش (فارسی یا انگلیسی)."""
        if not words:
            return ""
        n = len(words)
        per_word = max(min_cs_per_word, int(total_cs / n)) if total_cs > 0 else min_cs_per_word
        parts = []
        for w in words:
            parts.append(f"{{\\k{per_word}}}{w}")
        return " ".join(parts)

    def _build_drawing_rect(self, x1, y1, x2, y2):
        """ساخت رشته ترسیم مستطیل با دستورات drawing کد ASS (\\p1)."""
        return f"m {x1} {y1} l {x2} {y1} l {x2} {y2} l {x1} {y2}"

    def _estimate_ass_text_width_px(self, text, font_size):
        """تخمین عرض متن به پیکسل با همان فونت فارسی/انگلیسی مورد استفاده در ASS، برای محاسبه‌ی
        دقیق فاصله‌ی سر خوردن ورود/خروج واترمارک (دقیقاً مطابق measureText سمت مرورگر)."""
        try:
            font_path = PERSIAN_FONT_PATH if _contains_persian_chars(text) else ENGLISH_FONT_PATH
            font = ImageFont.truetype(font_path, font_size)
            bbox = font.getbbox(text)
            return max(10, bbox[2] - bbox[0])
        except Exception:
            return max(10, len(text) * font_size * 0.55)

    def _add_watermark_dialogue(self, lines_out, watermark, total_duration, res_w, res_h, ass_layer=2):
        """افزودن Dialogue های واترمارک/امضای شخصی سه‌بعدی و چرخشی، دقیقاً مطابق منطق سه‌فازی
        drawWatermark در studio.html سمت مرورگر:
          فاز ۱ (ورود): از لبه‌ی بوم با چرخش سه‌بعدی (فشرده‌شدن افقی \\fscx) سر می‌خورد و می‌رسد
          فاز ۲ (ثابت): بدون تغییر، با تپش نوری ملایم اختیاری
          فاز ۳ (خروج): نزدیک پایان کلیپ، چند دور می‌چرخد (\\frz)، کوچک می‌شود، و هم‌زمان با
                         پایان دقیق کلیپ به صفر می‌رسد و از طرف مخالف ورودش خارج می‌شود
        هر فاز به‌صورت یک Dialogue جداگانه با تگ \\t (انیمیشن زمان‌بندی‌شده‌ی ASS) ساخته می‌شود."""
        if not isinstance(watermark, dict) or not watermark.get("enabled") or not str(watermark.get("text", "")).strip():
            return
        text = str(watermark["text"]).strip()
        font_size = int(watermark.get("size", 30) or 30)
        color_hex = watermark.get("color", "#FFFFFF")
        opacity_pct = float(watermark.get("opacity", 70) or 70)
        position = watermark.get("position", "top-right")
        animated = bool(watermark.get("animated", True))

        margin = max(30, round(res_w * 0.03))
        # تبدیل موقعیت به alignment عددی ASS (numpad-style) + مختصات pos
        # an1=پایین‌چپ an2=پایین‌وسط an3=پایین‌راست an7=بالا‌چپ an8=بالا‌وسط an9=بالا‌راست
        if position == "top-left":
            an, px, py = 7, margin, margin
        elif position == "bottom-right":
            an, px, py = 3, res_w - margin, res_h - margin
        elif position == "bottom-left":
            an, px, py = 1, margin, res_h - margin
        elif position == "center-top":
            an, px, py = 8, res_w // 2, margin
        else:  # top-right (پیش‌فرض)
            an, px, py = 9, res_w - margin, margin

        alpha_val = max(0, min(255, round((1 - opacity_pct / 100.0) * 255)))
        primary_color = self._hex_to_ass_color(color_hex, alpha=alpha_val)
        outline_color = self._hex_to_ass_color("#000000", alpha=max(0, alpha_val - 40))
        alpha_tag_full = f"&H{alpha_val:02X}&"
        alpha_tag_hidden = "&HFF&"

        total_duration = max(0.5, total_duration)
        # همان ثابت‌های سمت مرورگر (WM_ENTRY_DURATION / WM_EXIT_DURATION / WM_EXIT_ROTATIONS)
        entry_dur = min(2.0, total_duration * 0.25)
        exit_dur = min(3.5, total_duration * 0.3)
        exit_start = max(entry_dur, total_duration - exit_dur)
        exit_rotations = 2.5

        # از همان سمتی که موقعیتش تعیین می‌کند وارد می‌شود؛ از طرف مخالف خارج می‌شود
        entry_side = -1 if "left" in position else 1
        exit_side = -entry_side

        text_width_px = self._estimate_ass_text_width_px(text, font_size)
        travel_distance = text_width_px + font_size * 2.5

        entry_start_x = px + entry_side * travel_distance
        exit_end_x = px + exit_side * travel_distance
        rotation_deg_total = exit_rotations * 360 * exit_side

        # ===== فاز ۱: ورود چرخشی (سر خوردن از لبه + فشرده‌شدن افقی که چرخش سه‌بعدی را شبیه‌سازی می‌کند) =====
        if entry_dur > 0.05:
            entry_end_ms = int(entry_dur * 1000)
            override = (
                f"{{\\an{an}\\pos({px},{py})\\fs{font_size}\\1c{primary_color}\\3c{outline_color}\\bord2"
                f"\\fscx15\\alpha{alpha_tag_hidden}"
                f"\\move({entry_start_x},{py},{px},{py},0,{entry_end_ms})"
                f"\\t(0,{entry_end_ms},\\fscx100\\alpha{alpha_tag_full})}}"
            )
            start_str = self._format_ass_time(0.0)
            end_str = self._format_ass_time(entry_dur)
            lines_out.append(f"Dialogue: {int(ass_layer)},{start_str},{end_str},Watermark,,0,0,0,,{override}{text}")

        # ===== فاز ۲: کاملاً ثابت (با تپش نوری ملایم اختیاری، دقیقاً مثل نسخه‌ی قبلی) =====
        static_start = entry_dur
        static_end = exit_start
        if static_end > static_start + 0.05:
            fade_tag = "\\fad(300,0)" if animated else ""
            override = f"{{\\an{an}\\pos({px},{py}){fade_tag}\\fs{font_size}\\1c{primary_color}\\3c{outline_color}\\bord2}}"
            start_str = self._format_ass_time(static_start)
            end_str = self._format_ass_time(static_end)
            lines_out.append(f"Dialogue: {int(ass_layer)},{start_str},{end_str},Watermark,,0,0,0,,{override}{text}")

        # ===== فاز ۳: خروج چرخشی، کوچک‌شدن، و محوشدگی - دقیقاً هم‌زمان با پایان کلیپ به صفر می‌رسد =====
        if exit_dur > 0.05:
            exit_len_ms = int((total_duration - exit_start) * 1000)
            exit_len_ms = max(50, exit_len_ms)
            override = (
                f"{{\\an{an}\\pos({px},{py})\\fs{font_size}\\1c{primary_color}\\3c{outline_color}\\bord2"
                f"\\fscx100\\fscy100\\frz0\\alpha{alpha_tag_full}"
                f"\\move({px},{py},{exit_end_x},{py},0,{exit_len_ms})"
                f"\\t(0,{exit_len_ms},\\fscx45\\fscy45\\frz{rotation_deg_total:.1f}\\alpha{alpha_tag_hidden})}}"
            )
            start_str = self._format_ass_time(exit_start)
            end_str = self._format_ass_time(total_duration)
            lines_out.append(f"Dialogue: {int(ass_layer)},{start_str},{end_str},Watermark,,0,0,0,,{override}{text}")

    def _generate_ass_subtitles(self, events, subtitle_defaults=None, watermark=None, total_duration=0.0, effect_lines=None, watermark_layer=2):
        ass_path = os.path.join(self.project_dir, "lyrics.ass")
        style = subtitle_defaults if isinstance(subtitle_defaults, dict) else {}

        resolution = getattr(self.project, "resolution", None) or [1080, 1920]
        try:
            RES_W, RES_H = max(1, int(resolution[0])), max(1, int(resolution[1]))
        except (TypeError, ValueError, IndexError):
            RES_W, RES_H = 1080, 1920
        MAX_TEXT_WIDTH = max(1, RES_W - 140)
        MAX_LINES = 2

        persian_base_size = int(style.get("size", style.get("font_size", 62)))
        english_base_size = 42
        persian_color = style.get("color", "#FFF000")
        stroke_color = style.get("stroke", style.get("stroke_color", "#000000"))
        stroke_width = int(style.get("sWidth", style.get("stroke_width", 5)))
        word_rate = float(style.get("wordRate", 2.5))
        auto_sync = style.get("autoSyncSpeed", True)
        lang_order = style.get("langOrder", "fa_first")

        header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {RES_W}
PlayResY: {RES_H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Persian,Vazirmatn,62,&H00FFFFFF&,&H00FFFFFF&,&H00000000&,&H00000000&,-1,0,0,0,100,100,0,0,1,5,0,8,20,20,20,1
Style: English,DejaVu Sans,42,&H00FFFFFF&,&H00FFFFFF&,&H00000000&,&H00000000&,-1,0,0,0,100,100,0,0,1,4,0,8,20,20,20,1
Style: BoxBG,Arial,10,&H00000000&,&H00000000&,&H00000000&,&H00000000&,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: Watermark,Vazirmatn,30,&H00FFFFFF&,&H00FFFFFF&,&H00000000&,&H00000000&,-1,0,0,0,100,100,0,0,1,2,0,9,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
        lines_out = [header]

        for e in events:
            if e.type not in ['lyrics', 'text'] or not e.content.strip():
                continue

            raw_text = e.content.strip()
            # تشخیص خودکار بخش فارسی/انگلیسی، مستقل از ترتیب نوشتن در کادر لیریکس
            persian_text, english_text = _split_bilingual_line(raw_text)

            start_t = float(e.start_time)
            end_t = float(e.end_time) if e.end_time else (start_t + 4.0)
            duration = max(0.15, end_t - start_t)
            start_str = self._format_ass_time(start_t)
            end_str = self._format_ass_time(end_t)

            # کلمه‌ی داخل *ستاره* = کلمه‌ی ویژه (برجسته). در ASS ستاره‌ها چاپ نمی‌شوند.
            def _clean_words(raw_text):
                words = []
                for word in raw_text.split(' '):
                    if not word:
                        continue
                    if len(word) > 2 and word.startswith('*') and word.endswith('*'):
                        word = word[1:-1]
                    words.append(word)
                return words

            persian_words = _clean_words(persian_text)
            english_words = _clean_words(english_text)

            p_lines, p_size = _fit_words_to_lines(PERSIAN_FONT_PATH, persian_words, MAX_TEXT_WIDTH, MAX_LINES, persian_base_size, 30)
            p_line_h = int(round(p_size * 1.35))
            p_block_h = len(p_lines) * p_line_h if p_lines else 0

            e_lines, e_size = _fit_words_to_lines(ENGLISH_FONT_PATH, english_words, MAX_TEXT_WIDTH, MAX_LINES, english_base_size, 22)
            e_line_h = int(round(e_size * 1.35)) if english_words else 0
            e_block_h = len(e_lines) * e_line_h if e_lines else 0

            gap_between = 28 if english_words else 0
            content_h = p_block_h + gap_between + e_block_h
            padding_v = 70
            box_h = max(380, content_h + padding_v * 2)

            margin_bottom = 85
            vertical_align = style.get("verticalAlign", "bottom")
            anim_preset = style.get("animPreset", style.get("animation_style", "cube_3d_horizontal"))

            if vertical_align == "middle":
                box_top = (RES_H - box_h) // 2
                bottom_y = box_top + box_h - padding_v
            elif vertical_align == "top":
                box_top = 95
                bottom_y = box_top + box_h - padding_v
            else:
                box_top = RES_H - box_h
                bottom_y = RES_H - margin_bottom

            en_first = (lang_order == "en_first")
            if not en_first:
                # فارسی بالا / انگلیسی پایین (پیش‌فرض)
                e_start_y = bottom_y - e_block_h + (e_line_h // 2 if e_line_h else 0)
                p_start_y = e_start_y - (gap_between if english_words else 0) - p_block_h + (p_line_h // 2 if p_line_h else 0)
            else:
                # انگلیسی بالا / فارسی پایین
                p_start_y = bottom_y - p_block_h + (p_line_h // 2 if p_line_h else 0)
                e_start_y = p_start_y - (gap_between if english_words else 0) - e_block_h + (e_line_h // 2 if e_line_h else 0)

            box_bottom = box_top + box_h

            # ۱) پس‌زمینه نیمه‌شفاف مستطیلی پشت متن (لایه ۰، زیر متن) - رنگ سیاه با شفافیت ~70%
            rect_draw = self._build_drawing_rect(0, box_top, RES_W, box_bottom)
            box_color_tag = "\\1c&H000000&\\1a&H4D&"
            lines_out.append(
                f"Dialogue: 0,{start_str},{end_str},BoxBG,,0,0,0,,{{\\an7\\pos(0,0){box_color_tag}\\p1}}{rect_draw}{{\\p0}}"
            )

            # ۲) بلوک فارسی (لایه ۱) با کارائوکه \\k -- Primary=سفید(خوانده‌شده) Secondary=رنگ اصلی(نخوانده)
            if persian_words:
                total_cs_persian = int(duration * 100)
                if not auto_sync:
                    # سرعت ثابت: هر کلمه به اندازه‌ی 100/wordRate صدم‌ثانیه
                    per_word_cs = max(8, int(100.0 / max(0.1, word_rate)))
                    total_cs_persian = per_word_cs * len(persian_words)
                karaoke_txt = self._build_karaoke_text(persian_words, total_cs_persian)
                idx = 0
                line_chunks = []
                for lw in p_lines:
                    chunk_words = persian_words[idx: idx + len(lw)]
                    idx += len(lw)
                    chunk_txt = self._build_karaoke_text(chunk_words, total_cs_persian // max(1, len(persian_words)) * len(chunk_words) if len(persian_words) else 0)
                    line_chunks.append(chunk_txt)
                full_persian_karaoke = "\\N".join(line_chunks)

                cube_turn_ms = min(650, int(duration * 1000 * 0.25))
                end_trans_start_ms = max(0, int(duration * 1000) - cube_turn_ms)

                if anim_preset == "cube_3d_horizontal":
                    fade_tag = f"\\fry90\\fscx0\\t(0,{cube_turn_ms},\\fry0\\fscx100)\\t({end_trans_start_ms},{int(duration*1000)},\\fry-90\\fscx0\\alpha&HFF&)"
                elif anim_preset in ("cube_3d_vertical", "cube_3d_bottom_up"):
                    # «پایین به بالا»: خط جاری رو به بالا می‌رود و خط بعد از پایین می‌آید (۹۰ درجه حول محور X)
                    fade_tag = f"\\frx90\\fscy0\\t(0,{cube_turn_ms},\\frx0\\fscy100)\\t({end_trans_start_ms},{int(duration*1000)},\\frx-90\\fscy0\\alpha&HFF&)"
                elif anim_preset == "word_reveal":
                    # کلمه‌به‌کلمه: کارائوکه‌ی کلمه‌ای (بالا) + ورود نرم و خروج رو به بالا
                    fade_tag = f"\\fad(160,200)\\move({RES_W // 2},{RES_H},{RES_W // 2},{RES_H - 60},0,{min(420, int(duration*1000))})"
                elif anim_preset == "kinetic_pop":
                    fade_tag = "\\fad(80,80)\\t(0,120,\\fscx115\\fscy115)\\t(120,240,\\fscx100\\fscy100)"
                elif anim_preset == "wave_float":
                    fade_tag = "\\fad(150,150)"
                else:
                    fade_tag = "\\fad(120,120)"

                pos_x = RES_W // 2
                pos_y = p_start_y - (p_line_h // 2 if p_line_h else 0)
                # فارسی: کلمه‌ی خوانده‌شده = سفید درخشان (Primary) | کلمه‌ی نخوانده = رنگ اصلی لیمویی (Secondary)
                override = (
                    f"{{\\an8\\pos({pos_x},{max(0,pos_y)})\\fs{p_size}{fade_tag}"
                    f"\\1c&HFFFFFF&\\2c{self._hex_to_ass_color(persian_color)}"
                    f"\\bord{stroke_width}\\3c{self._hex_to_ass_color(stroke_color)}}}"
                )
                lines_out.append(
                    f"Dialogue: 1,{start_str},{end_str},Persian,,0,0,0,,{override}{full_persian_karaoke}"
                )

            # ۳) بلوک انگلیسی (لایه ۱) با کارائوکه -- Primary=لیمویی بولد(خوانده‌شده) Secondary=فیروزه‌ای کم‌رنگ(نخوانده)
            if english_words:
                total_cs_english = int(duration * 100)
                if not auto_sync:
                    per_word_cs = max(8, int(100.0 / max(0.1, word_rate)))
                    total_cs_english = per_word_cs * len(english_words)

                idx = 0
                line_chunks = []
                for lw in e_lines:
                    chunk_words = english_words[idx: idx + len(lw)]
                    idx += len(lw)
                    chunk_txt = self._build_karaoke_text(chunk_words, total_cs_english // max(1, len(english_words)) * len(chunk_words) if len(english_words) else 0)
                    line_chunks.append(chunk_txt)
                full_english_karaoke = "\\N".join(line_chunks)

                pos_x = RES_W // 2
                pos_y = e_start_y - (e_line_h // 2 if e_line_h else 0)
                # انگلیسی: کلمه‌ی خوانده‌شده = لیمویی بولد با حاشیه مشکی ضخیم (Primary)
                # کلمه‌ی نخوانده = فیروزه‌ای کم‌رنگ نیمه‌شفاف (Secondary) با حاشیه مشکی نازک‌تر
                override = (
                    f"{{\\an8\\pos({pos_x},{max(0,pos_y)})\\fs{e_size}"
                    f"\\1c{self._hex_to_ass_color(persian_color)}\\2c{self._hex_to_ass_color('#00E5FF')}\\2a&H60&"
                    f"\\bord5\\3c&H000000&}}"
                )
                lines_out.append(
                    f"Dialogue: 1,{start_str},{end_str},English,,0,0,0,,{override}{full_english_karaoke}"
                )

        # هر افکت در ASS یک لایه‌ی جداگانه دارد؛ ترتیب از مدیر لایه‌های افکت می‌آید.
        if effect_lines:
            lines_out.extend(effect_lines)

        # واترمارک آخرین لایه است، مستقل از تعداد افکت‌ها.
        self._add_watermark_dialogue(lines_out, watermark, total_duration, RES_W, RES_H, ass_layer=watermark_layer)

        with open(ass_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines_out))
        return ass_path

    def render(self):
        self.progress_callback(5, "آماده‌سازی فایل‌های متنی و لایه‌ها...")
        ffmpeg_exe = get_ffmpeg_exe()

        duration = float(getattr(self.project, "duration", 15.0))
        if duration <= 0:
            duration = 15.0

        res_w, res_h = 1080, 1920
        if hasattr(self.project, "resolution") and self.project.resolution:
            res_w, res_h = self.project.resolution[0], self.project.resolution[1]
        fps = int(getattr(self.project, "fps", 30))

        # Separate events
        events = getattr(self.project, "events", [])
        audio_events = [e for e in events if getattr(e, "type", "") == 'audio']
        visual_events = [e for e in events if getattr(e, "type", "") in ['image', 'video']]
        text_events = [e for e in events if getattr(e, "type", "") in ['lyrics', 'text']]

        subtitle_defaults = getattr(self.project, "subtitle_defaults", None)
        watermark = getattr(self.project, "watermark", None)
        watermark_enabled = isinstance(watermark, dict) and watermark.get("enabled") and str(watermark.get("text", "")).strip()

        # Resolve the first usable audio asset once; effect plugins may share its analysis.
        first_audio_path = None
        for audio_event in audio_events:
            candidate = os.path.join(self.project_dir, getattr(audio_event, "content", ""))
            if os.path.isfile(candidate):
                first_audio_path = candidate
                break

        beat_cache = {}
        def cached_beat_detector(sensitivity=1.35, min_gap_sec=0.22):
            if not first_audio_path:
                return []
            key = (round(float(sensitivity), 4), round(float(min_gap_sec), 4))
            if key not in beat_cache:
                beat_cache[key] = detect_beat_times(
                    first_audio_path,
                    sensitivity=key[0],
                    min_gap_sec=key[1],
                )
            return [dict(event) for event in beat_cache[key]]

        effect_layers = getattr(self.project, "effect_layers", []) or []
        effect_context = {
            "audio_file_path": first_audio_path,
            "duration": duration,
            "width": res_w,
            "height": res_h,
            "detect_beats": cached_beat_detector,
            "progress_callback": self.progress_callback,
        }
        effect_lines = render_effect_layers(self, effect_layers, effect_context)
        watermark_layer = 2 + len(effect_layers)

        ass_file = None
        if text_events or watermark_enabled or effect_lines:
            ass_file = self._generate_ass_subtitles(
                text_events,
                subtitle_defaults=subtitle_defaults,
                watermark=watermark,
                total_duration=duration,
                effect_lines=effect_lines,
                watermark_layer=watermark_layer,
            )

        inputs = []
        bg_color = str(getattr(self.project, "background", "#000000")).replace('#', '')
        inputs.extend(["-f", "lavfi", "-i", f"color=c={bg_color}:s={res_w}x{res_h}:r={fps}:d={duration}"])

        input_idx = 1
        filter_chains = []
        last_video_pad = "0:v"
        has_cover_background = any(
            str(getattr(event, "fit", "") or "").lower() == "cover"
            and float(getattr(event, "start_time", 0.0) or 0.0) <= 0.0
            for event in visual_events
        )
        if not has_cover_background:
            base_grid = "base_grid"
            filter_chains.append(f"[0:v]drawgrid=width=80:height=80:thickness=2:color=0x141820[{base_grid}]")
            last_video_pad = base_grid

        for i, ve in enumerate(visual_events):
            content = getattr(ve, "content", "")
            file_path = os.path.join(self.project_dir, content)
            if not os.path.exists(file_path):
                continue
            if getattr(ve, "type", "") == "video":
                # Match the browser preview, which loops the selected background video.
                inputs.extend(["-stream_loop", "-1", "-i", file_path])
            else:
                inputs.extend(["-i", file_path])

            coord = getattr(ve, "coordinate", None)
            w, h, x, y, rotation = res_w, res_h, 0, 0, 0.0
            if coord and hasattr(coord, "to_pixels"):
                px = coord.to_pixels(res_w, res_h)
                w = px['w'] if px['w'] > 0 else res_w
                h = px['h'] if px['h'] > 0 else res_h
                x, y = px['x'], px['y']
                rotation = float(getattr(coord, "rotation", 0.0) or 0.0)
            elif isinstance(coord, dict):
                def parse_coordinate(value, total):
                    if isinstance(value, str) and value.strip().endswith('%'):
                        return int(float(value.strip()[:-1]) * total / 100.0)
                    return int(float(value))
                try:
                    w = parse_coordinate(coord.get("width", "100%"), res_w) or res_w
                    h = parse_coordinate(coord.get("height", "100%"), res_h) or res_h
                    x = parse_coordinate(coord.get("x", 0), res_w)
                    y = parse_coordinate(coord.get("y", 0), res_h)
                    rotation = float(coord.get("rotation", coord.get("rotation_degrees", 0.0)) or 0.0)
                except (TypeError, ValueError):
                    pass

            scaled_pad = f"s_{i}"
            fit_mode = str(getattr(ve, "fit", "contain") or "contain").lower()
            if fit_mode == "cover":
                scale_filter = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"
            elif fit_mode in {"stretch", "fill"}:
                scale_filter = f"scale={w}:{h}"
            else:
                scale_filter = f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black@0"
            filter_chains.append(f"[{input_idx}:v]{scale_filter}[{scaled_pad}]")
            overlay_pad = scaled_pad
            if abs(rotation) > 1e-6:
                angle = math.radians(rotation)
                rotated_w = math.ceil(abs(w * math.cos(angle)) + abs(h * math.sin(angle)))
                rotated_h = math.ceil(abs(h * math.cos(angle)) + abs(w * math.sin(angle)))
                x = int(round(x - (rotated_w - w) / 2.0))
                y = int(round(y - (rotated_h - h) / 2.0))
                overlay_pad = f"rot_{i}"
                filter_chains.append(f"[{scaled_pad}]rotate={angle:.8f}:ow=rotw(iw):oh=roth(ih):c=black@0[{overlay_pad}]")

            next_pad = f"ov_{i}"
            st_t = getattr(ve, "start_time", 0.0)
            en_t = getattr(ve, "end_time", duration)
            enable_expr = f"between(t,{st_t},{en_t})"
            filter_chains.append(f"[{last_video_pad}][{overlay_pad}]overlay=x={x}:y={y}:enable='{enable_expr}'[{next_pad}]")
            last_video_pad = next_pad
            input_idx += 1

        if ass_file:
            sub_pad = "sub_out"
            escaped_ass = ass_file.replace('\\', '/').replace(':', '\\:')
            escaped_fontdir = FONT_DIR.replace('\\', '/').replace(':', '\\:')
            filter_chains.append(f"[{last_video_pad}]subtitles={escaped_ass}:fontsdir={escaped_fontdir}[{sub_pad}]")
            last_video_pad = sub_pad

        audio_pads = []
        for ae in audio_events:
            content = getattr(ae, "content", "")
            file_path = os.path.join(self.project_dir, content)
            if os.path.exists(file_path):
                inputs.extend(["-i", file_path])
                st_t = getattr(ae, "start_time", 0.0)
                delay_ms = int(st_t * 1000)
                apad = f"a_{input_idx}"
                filter_chains.append(f"[{input_idx}:a]adelay={delay_ms}|{delay_ms},atrim=0:{duration}[{apad}]")
                audio_pads.append(apad)
                input_idx += 1

        final_audio_opt = []
        if audio_pads:
            if len(audio_pads) == 1:
                final_audio_pad = audio_pads[0]
            else:
                final_audio_pad = "amix_out"
                filter_chains.append(f"{''.join([f'[{p}]' for p in audio_pads])}amix=inputs={len(audio_pads)}:duration=first:dropout_transition=2[{final_audio_pad}]")

            # اعمال اکولایزر/میکس صدا (باس، میدرنج، تربل، صدای کلی) - دقیقاً مطابق همان مقادیری
            # که کاربر توی پیش‌نمایش مرورگر (Web Audio API) تنظیم کرده، اینجا هم روی صدای نهایی اعمال می‌شود
            audio_eq = getattr(self.project, "audio_eq", None)
            eq_has_changes = isinstance(audio_eq, dict) and (
                any(float(audio_eq.get(k, 0) or 0) != 0 for k in ("bass", "mid", "treble"))
                or float(audio_eq.get("volume", 100) or 100) != 100
            )
            if eq_has_changes:
                eq_bass = float(audio_eq.get("bass", 0) or 0)
                eq_mid = float(audio_eq.get("mid", 0) or 0)
                eq_treble = float(audio_eq.get("treble", 0) or 0)
                eq_volume_pct = float(audio_eq.get("volume", 100) or 100)
                eq_pad = "eq_out"
                eq_filter_parts = []
                if eq_bass != 0:
                    eq_filter_parts.append(f"bass=g={eq_bass}:f=200:w=0.5")
                if eq_mid != 0:
                    eq_filter_parts.append(f"equalizer=f=1000:t=q:w=1.0:g={eq_mid}")
                if eq_treble != 0:
                    eq_filter_parts.append(f"treble=g={eq_treble}:f=3000:w=0.5")
                if eq_volume_pct != 100:
                    eq_filter_parts.append(f"volume={max(0.0, eq_volume_pct)/100.0}")
                if eq_filter_parts:
                    eq_chain = ",".join(eq_filter_parts)
                    filter_chains.append(f"[{final_audio_pad}]{eq_chain}[{eq_pad}]")
                    final_audio_pad = eq_pad

            final_audio_opt = ["-map", f"[{final_audio_pad}]"]
        else:
            inputs.extend(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"])
            final_audio_opt = ["-map", f"{input_idx}:a", "-shortest"]
            input_idx += 1

        filter_graph_str = ";".join(filter_chains)

        cmd = [ffmpeg_exe, "-y"] + inputs
        if filter_graph_str:
            cmd.extend(["-filter_complex", filter_graph_str])
        # نکته: last_video_pad وقتی خروجی واقعی یک فیلتر باشد باید با براکت [...] رفرنس شود،
        # اما وقتی هیچ فیلتر تصویری اجرا نشده (last_video_pad هنوز همان "0:v" اولیه است)،
        # این فقط یک stream specifier خام است و نباید داخل براکت گذاشته شود.
        video_map_ref = f"[{last_video_pad}]" if filter_graph_str and last_video_pad != "0:v" else "0:v"
        cmd.extend(["-map", video_map_ref] + final_audio_opt)
        cmd.extend(["-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "320k", "-t", str(duration), self.output_path])

        self.progress_callback(15, "آغاز پردازش رندر و ترکیب مدیا...")
        # stdout is unused by ffmpeg here; DEVNULL avoids a full pipe blocking the encoder.
        process = subprocess.Popen(cmd, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL, universal_newlines=True)
        self.process = process
        if self.cancel_requested:
            self.cancel()
        time_pattern = re.compile(r"time=(\d{2}):(\d{2}):(\d{2}\.\d{2})")

        stderr_tail = []
        while True:
            line = process.stderr.readline()
            if not line and process.poll() is not None:
                break
            if line:
                stderr_tail.append(line)
                if len(stderr_tail) > 40:
                    stderr_tail.pop(0)
                match = time_pattern.search(line)
                if match:
                    h, m, s = float(match.group(1)), float(match.group(2)), float(match.group(3))
                    current_sec = h * 3600 + m * 60 + s
                    pct = min(95, 15 + int((current_sec / duration) * 80))
                    self.progress_callback(pct, f"رندر ویدیو: {int((current_sec/duration)*100)}% انجام شده...")

        process.stderr.close()
        ret = process.poll()
        if self.cancel_requested:
            raise RenderCancelled("رندر توسط کاربر متوقف شد.")
        if ret != 0:
            raise RuntimeError(f"FFmpeg failed with exit code {ret}:\n" + "".join(stderr_tail))

        self.progress_callback(100, "رندر با موفقیت به پایان رسید!")


class MoviePyRenderer(RenderEngine):
    def render(self):
        # The legacy MoviePy path was only a no-op status stub. Delegate to the
        # FFmpeg compositor so every selected engine actually exports the project
        # and receives the same dynamically registered effect layers.
        self.progress_callback(1, "در حال آماده‌سازی کامپوزیت لایه‌های پروژه...")
        return FFmpegRenderer(
            self.project,
            self.project_dir,
            self.output_path,
            progress_callback=self.progress_callback,
        ).render()
