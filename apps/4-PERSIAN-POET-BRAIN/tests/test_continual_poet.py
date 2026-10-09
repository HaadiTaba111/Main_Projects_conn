"""
تست‌های مغز شاعر + آموزش پیوسته (بدون نیاز به torch/GPU).

پوشش:
  • خودآزمایی داخلی continual_eval.py و poet_continual_sft.py
  • تقطیر دیتاست واقعی برنامه به تسک‌ها و ساخت config
  • اعتبارسنجی ماتریس R و پل ماتریس -> سنجه‌ها (ACC/BWT/Forgetting)
  • گزارش continual در مغز زندهٔ شاعر (persian_living_brain.continual_report_text)
  • مسیر دیتاست/بافر بازخورد (بازخورد کاربر باید به همان دیتاست آموزش برسد)

اجرا:
    cd apps/4-PERSIAN-POET-BRAIN
    python3 -m unittest discover -s tests -v
"""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTINUAL_DIR = os.path.join(APP_DIR, "continual")
DATASET = os.path.join(APP_DIR, "datasets", "persian_poet_satire_sft.jsonl")

sys.path.insert(0, CONTINUAL_DIR)
sys.path.insert(0, APP_DIR)

import continual_eval  # noqa: E402
import poet_continual_sft  # noqa: E402
import prepare_poet_tasks  # noqa: E402


def load_living_brain():
    """بارگذاری پویا تا نام ماژول با پوشهٔ tests تداخل نکند."""
    spec = importlib.util.spec_from_file_location(
        "poet_living_brain_under_test", os.path.join(APP_DIR, "persian_living_brain.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ModuleSelftestTests(unittest.TestCase):
    """فایل‌های آپلودشده باید خودآزمایی داخلی خودشان را سبز بگذرانند."""

    def _run_selftest(self, filename):
        result = subprocess.run(
            [sys.executable, os.path.join(CONTINUAL_DIR, filename), "--selftest"],
            cwd=APP_DIR, capture_output=True, text=True, timeout=300)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result.stdout

    def test_continual_eval_selftest(self):
        output = self._run_selftest("continual_eval.py")
        self.assertIn("همهٔ ۱۰ آزمون گذشت", output)

    def test_poet_continual_sft_selftest(self):
        output = self._run_selftest("poet_continual_sft.py")
        self.assertIn("همهٔ ۱۰ آزمون گذشت", output)
        self.assertIn("پل به continual_eval درست کار می‌کند", output)


class DatasetBridgeTests(unittest.TestCase):
    """دیتاست واقعی برنامه باید بدون دست‌کاری به تسک‌های آموزش تبدیل شود."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_real_dataset_is_split_into_ordered_tasks(self):
        result = prepare_poet_tasks.prepare(
            dataset=DATASET,
            data_dir=os.path.join(self.temp_dir, "data"),
            config_path=os.path.join(self.temp_dir, "config.poet.json"))

        self.assertGreaterEqual(result["records"], 4)
        categories = [t["source_category"] for t in result["tasks"]]
        self.assertEqual(categories[:2], ["classical_poetry", "mystical_rumi"])

        with open(result["config"], encoding="utf-8") as f:
            config = json.load(f)
        self.assertEqual(len(config["tasks"]), len(result["tasks"]))
        self.assertIn("base_model", config)
        self.assertTrue(os.path.isabs(config["tasks"][0]["file"]))

    def test_prepared_task_files_load_with_the_trainer(self):
        result = prepare_poet_tasks.prepare(
            dataset=DATASET,
            data_dir=os.path.join(self.temp_dir, "data"),
            config_path=os.path.join(self.temp_dir, "config.poet.json"))
        with open(result["config"], encoding="utf-8") as f:
            config = json.load(f)

        tasks = poet_continual_sft.load_tasks(config["tasks"])
        self.assertEqual(len(tasks), len(result["tasks"]))
        for task in tasks:
            self.assertTrue(task["train"], f"تسک {task['name']} داده ندارد")
            self.assertTrue(task["eval"], f"تسک {task['name']} نمونه ارزیابی ندارد")
            record = task["train"][0]
            self.assertIn("instruction", record)
            self.assertIn("response", record)

    def test_committed_config_points_at_committed_task_files(self):
        """config.poet.json که در مخزن است باید همان فایل‌های continual/data را ببیند."""
        config_path = os.path.join(CONTINUAL_DIR, "config.poet.json")
        self.assertTrue(os.path.isfile(config_path), "config.poet.json باید در مخزن باشد")
        with open(config_path, encoding="utf-8") as f:
            config = json.load(f)
        for task in config["tasks"]:
            path = task["file"] if os.path.isabs(task["file"]) else os.path.join(APP_DIR, task["file"])
            with self.subTest(task=task["name"]):
                self.assertTrue(os.path.isfile(path), f"{path} پیدا نشد")


class MatrixBridgeTests(unittest.TestCase):
    """ماتریس R خروجی آموزش باید با سنجه‌ها خوانده شود."""

    def test_matrix_scores_flow_into_continual_metrics(self):
        names = ["حافظ", "عبید", "طنز", "جوک"]
        stages = [
            {"حافظ": 0.90},
            {"حافظ": 0.85, "عبید": 0.88},
            {"حافظ": 0.83, "عبید": 0.86, "طنز": 0.91},
            {"حافظ": 0.82, "عبید": 0.85, "طنز": 0.89, "جوک": 0.94},
        ]
        matrix = poet_continual_sft.build_matrix(names, stages)

        # خانه‌های آینده باید نامعلوم بمانند (تسک دیده‌نشده ارزیابی نمی‌شود)
        self.assertIsNone(matrix[0][1])
        self.assertIsNone(matrix[2][3])

        with tempfile.TemporaryDirectory() as tmp:
            path = poet_continual_sft.save_matrix(
                os.path.join(tmp, "results.json"), names, matrix)
            loaded = continual_eval.load_results(path)

        summary = loaded.summary()
        self.assertEqual(summary["T"], 4)
        self.assertAlmostEqual(summary["ACC"], 0.875, places=3)
        self.assertGreater(summary["Forgetting"], 0.0)
        self.assertLess(summary["BWT"], 0.0)
        report = continual_eval.format_report(summary)
        self.assertIn("ACC", report)

    def test_simulated_forgetting_scenario_is_measurable(self):
        """سناریوی شبیه‌سازی‌شده باید فراموشی را نشان دهد (سنجه درست کار می‌کند)."""
        raw = continual_eval.simulate_scenario(T=4, mode="forget", seed=1)
        summary = continual_eval.ContinualMatrix(raw).summary()
        self.assertGreater(summary["Forgetting"], 0.0)
        self.assertLess(summary["BWT"], 0.0)

    def test_recovery_ratio_and_fade_profile(self):
        result = continual_eval.recovery_ratio(tokens=[100, 200, 400], scores=[0.5, 0.8, 0.95])
        self.assertIn("ratio", result)
        self.assertTrue(result["recovered"])
        label = continual_eval.fade_profile(result["ratio"])
        self.assertIsInstance(label, str)
        self.assertIn(label, {"fade کوچک (محو، نه فراموشی)", "حالت ميانی", "forget (فراموشی واقعی)"})

    def test_unrecovered_scenario_is_reported_honestly(self):
        """اگر عملکرد هرگز به آستانه برنگردد، سنجه باید صریح بگوید بازيابی نشد."""
        result = continual_eval.recovery_ratio(tokens=[10, 20, 30], scores=[0.9, 0.2, 0.3])
        self.assertFalse(result["recovered"])
        self.assertIn("بازيابی نشد", continual_eval.fade_profile(result["ratio"]))


class LivingBrainIntegrationTests(unittest.TestCase):
    """مغز زندهٔ شاعر باید مسیر درست دیتاست و گزارش سنجه‌ها را بشناسد."""

    @classmethod
    def setUpClass(cls):
        cls.brain_module = load_living_brain()

    def test_dataset_paths_are_inside_the_app(self):
        self.assertEqual(os.path.normpath(self.brain_module.DATASETS_DIR),
                         os.path.normpath(os.path.join(APP_DIR, "datasets")))
        self.assertTrue(os.path.isfile(self.brain_module.SFT_TRAINING_FILE))
        self.assertTrue(self.brain_module.RAG_BUFFER_FILE.startswith(self.brain_module.DATASETS_DIR))

    def test_metrics_command_without_matrix_gives_instructions(self):
        text = self.brain_module.continual_report_text(
            os.path.join(tempfile.gettempdir(), "definitely_missing_results.json"))
        self.assertIn("run_poet_continual.sh", text)

    def test_metrics_command_reports_real_matrix(self):
        with tempfile.TemporaryDirectory() as tmp:
            names = ["حافظ", "عبید", "طنز"]
            stages = [{"حافظ": 0.9}, {"حافظ": 0.85, "عبید": 0.88},
                      {"حافظ": 0.83, "عبید": 0.86, "طنز": 0.91}]
            path = poet_continual_sft.save_matrix(
                os.path.join(tmp, "results.json"), names,
                poet_continual_sft.build_matrix(names, stages))
            text = self.brain_module.continual_report_text(path)

        self.assertIn("ACC", text)
        self.assertIn("Forgetting", text)

    def test_feedback_fuels_the_training_dataset(self):
        """تصحیح کاربر باید در همان فایل SFT بنشیند که تقطیر تسک‌ها از آن می‌خواند."""
        with tempfile.TemporaryDirectory() as tmp:
            dataset = os.path.join(tmp, "sft.jsonl")
            shutil.copyfile(DATASET, dataset)
            brain = self.brain_module.PersianLivingBrain.__new__(self.brain_module.PersianLivingBrain)
            brain.rag_memory = [{
                "prompt": "یک بیت بگو",
                "response": "پاسخ قدیمی",
                "feedback": "DISLIKE",
                "correction": "دوش دیدم که ملائک در میخانه زدند",
                "timestamp": "2026-01-01T00:00:00",
            }]
            brain._save_rag_buffer = lambda: None

            original = self.brain_module.SFT_TRAINING_FILE
            try:
                self.brain_module.SFT_TRAINING_FILE = dataset
                message = brain.distill_to_sft_dataset()
            finally:
                self.brain_module.SFT_TRAINING_FILE = original

            self.assertIn("تقطیر موفق", message)
            rows = poet_continual_sft.read_jsonl(dataset)
            self.assertTrue(any("ملائک" in r["response"] for r in rows))


if __name__ == "__main__":
    unittest.main()
