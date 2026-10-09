"""تست یکپارچگی مکعب سه‌بعدی لیریکس داخل استودیو (LyraX Cube).

اجرا:
    python -m unittest discover -s tests
    node tests/cube_preview.test.mjs    # تست رفتاری ماژول مکعب بدون مرورگر
"""
import html.parser
import pathlib
import shutil
import subprocess
import unittest

APP_DIR = pathlib.Path(__file__).resolve().parents[1]
STATIC = APP_DIR / "static"
CUBE_JS = STATIC / "js" / "cube"

VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}


class _TagBalanceChecker(html.parser.HTMLParser):
    """بررسی می‌کند تگ‌های HTML متوازن باشند (خطای چیدمان مکعب را می‌گیرد)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, tuple]] = []
        self.errors: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID_TAGS:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag in VOID_TAGS:
            return
        if not self.stack:
            self.errors.append(f"extra </{tag}> at {self.getpos()}")
            return
        opened, position = self.stack.pop()
        if opened != tag:
            self.errors.append(f"<{opened}> opened at {position} closed by </{tag}> at {self.getpos()}")


class CubePreviewWiringTests(unittest.TestCase):
    """فایل‌های مکعب + اتصال آن به هر دو نسخه‌ی صفحه‌ی استودیو."""

    PAGES = ("studio.html", "templates/index.html")

    def _read(self, relative: str) -> str:
        return (APP_DIR / relative).read_text(encoding="utf-8")

    def test_cube_assets_exist(self):
        for relative in (
            "static/js/cube/CubeRenderer.js",
            "static/js/cube/ParticleSystem.js",
            "static/js/cube/cube-preview.js",
            "static/css/cube.css",
            "static/cube-studio/index.html",
            "static/cube-studio/css/style.css",
            "static/cube-studio/js/app.js",
            "static/cube-studio/js/cubeRenderer.js",
            "static/cube-studio/js/particles.js",
            "static/cube-studio/js/lyricsParser.js",
            "static/cube-studio/js/videoExporter.js",
        ):
            with self.subTest(asset=relative):
                self.assertTrue((APP_DIR / relative).is_file(), f"{relative} باید وجود داشته باشد")

    def test_studio_pages_expose_cube_bottom_up_as_style_preset(self):
        """مکعب دیگر پنل جداگانه نیست: پریست «چرخان از پایین به بالا» در منوی استایل لیریکس است."""
        for page in self.PAGES:
            content = self._read(page)
            with self.subTest(page=page):
                self.assertIn('value="cube_3d_bottom_up"', content)
                self.assertIn('value="word_reveal"', content)
                self.assertIn("function triggerCubeTurn(", content)
                # آتش‌بازی جای رعدوبرق: لایه‌ی آماده‌ی شلیک دستی تا دکمه‌های 🎆 زیر کلیپ بیایند
                self.assertIn("host.addLayer('fireworks')", content)
                self.assertIn("stepNext(true)", content)
                self.assertIn("/static/cube-studio/index.html", content)  # لینک استودیوی مستقل مکعب
                # پنل داکی‌شده‌ی قبلی نباید برگردد (کلیپ باید همیشه دیده شود)
                self.assertNotIn('id="cubePanel"', content)
                self.assertNotIn('id="cubeStage"', content)
                self.assertNotIn('/static/js/cube/cube-preview.js', content)

    def test_studio_pages_ship_word_reveal_engine(self):
        """افکت کلمه‌به‌کلمه: کلمه‌ی *ویژه* + ورود از پایین + خروج رو به بالا."""
        for page in self.PAGES:
            content = self._read(page)
            with self.subTest(page=page):
                self.assertIn("const WordRevealEngine", content)
                self.assertIn("isWordReveal", content)
                self.assertIn("pHighlight", content)
                self.assertIn("HIGHLIGHT_SCALE", content)

    def test_studio_keyboard_brings_the_next_lyric(self):
        """Space/Enter/→/↓ = خط بعدی، ←/↑ = خط قبلی (هم در تپ و هم در سینک خودکار LRC)."""
        for page in self.PAGES:
            content = self._read(page)
            with self.subTest(page=page):
                self.assertIn("['Space', 'Enter', 'ArrowRight', 'ArrowDown']", content)
                self.assertIn("['ArrowLeft', 'ArrowUp']", content)
                self.assertIn("function stepNext(force)", content)
                self.assertIn("function stepPrev(force)", content)

    def test_studio_hooks_sync_cube_with_lyric_lines(self):
        for page in self.PAGES:
            content = self._read(page)
            with self.subTest(page=page):
                self.assertIn("function syncLyraXCubeLines()", content)
                self.assertIn("function syncLyraXCubeLine(idx)", content)
                self.assertIn("syncLyraXCubeLines();", content)
                self.assertIn("syncLyraXCubeLine(idx);", content)
                self.assertIn("window.LyraXCube.setLines", content)
                self.assertIn("window.LyraXCube.jumpToLine", content)
                self.assertIn("lyrax:line", content)

    def test_cube_transition_timing_still_optimized(self):
        """تایمینگ چرخش مکعب زیرنویس (۰.۸۵ ثانیه) نباید در ادغام از دست برود."""
        for page in self.PAGES:
            content = self._read(page)
            with self.subTest(page=page):
                self.assertIn("TRANSITION_DURATION: 0.85", content)

    def test_pages_are_well_formed_html(self):
        for page in self.PAGES:
            checker = _TagBalanceChecker()
            checker.feed(self._read(page))
            with self.subTest(page=page):
                self.assertEqual(checker.errors, [])
                self.assertEqual(checker.stack, [])

    def test_standalone_cube_studio_page_links_back(self):
        index = self._read("static/cube-studio/index.html")
        self.assertIn('href="/"', index)
        self.assertIn("js/app.js", index)
        self.assertIn("lyricsCube", index)

    def test_effect_plugins_ship_alongside_cube(self):
        """افکت‌های رعدوبرق/آتش‌بازی باید همان‌جای همیشگی کشف شوند."""
        from backend.effects.registry import get_effect_specs

        specs = {spec["id"] for spec in get_effect_specs()}
        self.assertIn("lightning", specs)
        self.assertIn("fireworks", specs)

    def test_effects_catalog_puts_fireworks_in_lightning_slot(self):
        """آتش‌بازی جای رعدوبرق را در فهرست و تریگرهای سریع گرفته است."""
        from backend.effects.registry import get_effect_specs

        specs = get_effect_specs()
        self.assertTrue(specs, "فهرست افکت‌ها نباید خالی باشد")
        self.assertEqual(specs[0]["id"], "fireworks", "افکت اول فهرست باید آتش‌بازی باشد")
        # دکمه‌های دستی آتش‌بازی (کلید ۵) حذف شده‌اند؛ افکت اول همچنان آتش‌بازی است.
        self.assertEqual(specs[0]["manual_triggers"], [])

    def test_ass_export_supports_new_presets_and_strips_markers(self):
        """خروجی FFmpeg/ASS هم چرخش رو به بالا و هم کلمه‌به‌کلمه را می‌شناسد و *ستاره*ها را چاپ نمی‌کند."""
        import tempfile as _tempfile
        import types

        from backend.renderers import FFmpegRenderer

        renderer = object.__new__(FFmpegRenderer)
        with _tempfile.TemporaryDirectory() as tmp:
            renderer.project_dir = tmp
            renderer.project = types.SimpleNamespace(resolution=[1080, 1920])
            event = types.SimpleNamespace(type="lyrics", content="این یک *تست* است / This is a *test*",
                                          start_time=0.0, end_time=2.0)

            ass_path = renderer._generate_ass_subtitles(
                [event], subtitle_defaults={"animPreset": "cube_3d_bottom_up"}, total_duration=2.0)
            bottom_up = pathlib.Path(ass_path).read_text(encoding="utf-8")
            self.assertIn("\\frx90", bottom_up, "پریست پایین‌به‌بالا باید چرخش حول محور X بدهد")
            self.assertNotIn("*", bottom_up, "ستاره‌های کلمه‌ی ویژه نباید در ویدیو دیده شوند")

            ass_path = renderer._generate_ass_subtitles(
                [event], subtitle_defaults={"animPreset": "word_reveal"}, total_duration=2.0)
            reveal = pathlib.Path(ass_path).read_text(encoding="utf-8")
            self.assertIn("\\fad(160,200)", reveal, "پریست کلمه‌به‌کلمه باید ورود/خروج نرم داشته باشد")

    def test_cube_assets_and_standalone_page_are_served_by_flask(self):
        """سرور واقعی باید استودیوی مکعب و فایل‌های آن را سرو کند."""
        from app import app

        client = app.test_client()
        page = client.get("/").data.decode("utf-8")
        self.assertIn('value="cube_3d_bottom_up"', page)
        self.assertNotIn('id="cubeStage"', page, "پنل مکعب نباید داخل استودیو برگردد")
        cube_page = client.get("/static/cube-studio/index.html").data.decode("utf-8")
        self.assertIn('id="lyricsCube"', cube_page)
        self.assertIn('id="particleCanvas"', cube_page)
        for path in (
            "/static/js/cube/CubeRenderer.js",
            "/static/js/cube/ParticleSystem.js",
            "/static/js/cube/cube-preview.js",
            "/static/css/cube.css",
            "/static/cube-studio/index.html",
            "/static/cube-studio/js/app.js",
        ):  # noqa: E128
            with self.subTest(path=path):
                self.assertEqual(client.get(path).status_code, 200, f"{path} باید با 200 سرو شود")

    @unittest.skipIf(shutil.which("node") is None, "node در این محیط نصب نیست")
    def test_word_reveal_behaviour_suite_passes_in_node(self):
        """موتور کلمه‌به‌کلمه‌ی داخل studio.html با کد واقعی خودش تست می‌شود."""
        result = subprocess.run(
            ["node", str(APP_DIR / "tests" / "word_reveal.test.mjs")],
            cwd=str(APP_DIR),
            capture_output=True,
            text=True,
            timeout=120,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    @unittest.skipIf(shutil.which("node") is None, "node در این محیط نصب نیست")
    def test_cube_behaviour_suite_passes_in_node(self):
        result = subprocess.run(
            ["node", str(APP_DIR / "tests" / "cube_preview.test.mjs")],
            cwd=str(APP_DIR),
            capture_output=True,
            text=True,
            timeout=120,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
