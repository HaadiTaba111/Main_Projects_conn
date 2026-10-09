"""تست توقف رندر: ffmpeg واقعی باید بلافاصله کشته شود و خروجی ناقص نماند.

اجرا:  python3 -m unittest tests.test_render_cancel
"""
import os
import shutil
import time
import unittest

from backend.models import Project
from backend.services import FileService, RenderService

PROJECT_NAME = "cancel_test_project"


class RenderCancelTests(unittest.TestCase):
    def setUp(self):
        self.project_dir = FileService.get_project_dir(PROJECT_NAME)  # same sanitisation as the renderer
        shutil.rmtree(self.project_dir, ignore_errors=True)

    def tearDown(self):
        shutil.rmtree(self.project_dir, ignore_errors=True)

    def _wait_for(self, job_id, statuses, timeout=30.0):
        deadline = time.time() + timeout
        status = {}
        while time.time() < deadline:
            status = RenderService.get_job_status(job_id)
            if status.get("status") in statuses:
                return status
            time.sleep(0.1)
        self.fail(f"job {job_id} did not reach {statuses}; last status={status}")

    def test_cancel_stops_ffmpeg_and_discards_partial_output(self):
        project = Project(name=PROJECT_NAME)
        project.duration = 600.0  # long enough that it cannot finish during the test
        FileService.get_project_dir(PROJECT_NAME)
        job_id = RenderService.start_render_job(project, engine_type="ffmpeg")
        self._wait_for(job_id, {"rendering"}, timeout=5)
        # wait until ffmpeg reports real encoding progress ("time=" lines), not just the setup stage
        deadline = time.time() + 30
        while time.time() < deadline and not RenderService.get_job_status(job_id).get("message", "").startswith("رندر ویدیو"):
            time.sleep(0.1)
        self.assertTrue(RenderService.get_job_status(job_id).get("message", "").startswith("رندر ویدیو"))

        started = time.time()
        RenderService.cancel_job(job_id)
        status = self._wait_for(job_id, {"cancelled", "error", "completed"}, timeout=15)
        elapsed = time.time() - started

        self.assertEqual(status["status"], "cancelled", status)
        self.assertIsNone(status.get("error"))
        self.assertLess(elapsed, 10, "cancel should stop the encoder quickly")
        self.assertFalse(os.path.exists(os.path.join(self.project_dir, f"{PROJECT_NAME}_export.mp4")))

    def test_cancel_unknown_or_finished_job_is_harmless(self):
        self.assertEqual(RenderService.cancel_job("job_does_not_exist")["status"], "not_found")


if __name__ == "__main__":
    unittest.main()
