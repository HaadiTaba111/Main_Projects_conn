"""کلمه‌ی ویژه‌ی *ستاره* در خروجی ASS: زرد و بزرگ‌تر مثل پیش‌نمایش، بقیه‌ی کلمات عادی."""
import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.renderers import FFmpegRenderer  # noqa: E402


class KaraokeMarkerTests(unittest.TestCase):
    def setUp(self):
        self.renderer = object.__new__(FFmpegRenderer)

    def _karaoke(self, words, highlights):
        return self.renderer._build_karaoke_text(
            words, total_cs=400, highlights=highlights, base_size=60,
            sung_color="&HFFFFFF&", unsung_color="&H00AAFF&", hl_color="&H00F0FF&",
        )

    def test_highlighted_word_is_yellow_and_larger(self):
        text = self._karaoke(["سلام", "دنیا"], [False, True])
        # کلمه‌ی دوم: فونت ×۱٫۴۲ (۶۰→۸۵) و رنگ زرد
        self.assertIn("\\fs85", text)
        self.assertIn("\\1c&H00F0FF&", text)
        self.assertIn("\\fs60\\1c&HFFFFFF&", text)  # برگشت به حالت عادی بعد از کلمه‌ی ویژه
        self.assertIn("}سلام", text)
        self.assertIn("}دنیا", text)

    def test_plain_words_have_no_color_or_size_override(self):
        text = self._karaoke(["یک", "دو"], [False, False])
        self.assertNotIn("\\fs", text)
        self.assertNotIn("\\1c", text)
        self.assertEqual(text.count("\\k"), 2)

    def test_missing_style_info_falls_back_to_plain_karaoke(self):
        text = self.renderer._build_karaoke_text(["یک", "دو"], total_cs=200, highlights=[True, True])
        self.assertNotIn("\\fs", text)
        self.assertEqual(text.count("\\k"), 2)


if __name__ == "__main__":
    unittest.main()
