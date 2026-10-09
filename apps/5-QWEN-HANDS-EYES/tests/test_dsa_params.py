"""تست بارگذاری پارامترهای DSA (بدون هیچ مقدار محرمانه‌ای در تست).

اجرا:  python3 -m unittest tests.test_dsa_params
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config.dsa_params import DsaParamsError, find_vault_dir, load_dsa_params  # noqa: E402


class DsaParamsLoaderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.vault = self.tmp / ".dsa_vault"
        (self.vault / "params").mkdir(parents=True)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _write_vault(self, data):
        (self.vault / "params" / "dsa_params.json").write_text(json.dumps(data), encoding="utf-8")

    def test_env_wins_over_vault(self):
        self._write_vault({"lambda": 0.1, "gamma": 0.2, "min_weight": 0.3})
        env = {"DSA_LAMBDA": "0.5", "DSA_GAMMA": "0.6", "DSA_MIN_WEIGHT": "0.7"}
        self.assertEqual(load_dsa_params(environ=env, vault_dir=self.vault),
                         {"lambda": 0.5, "gamma": 0.6, "min_weight": 0.7})

    def test_vault_used_when_env_absent(self):
        self._write_vault({"lambda": 0.1, "gamma": 0.2, "min_weight": 0.3})
        self.assertEqual(load_dsa_params(environ={}, vault_dir=self.vault),
                         {"lambda": 0.1, "gamma": 0.2, "min_weight": 0.3})

    def test_missing_values_fail_closed(self):
        with self.assertRaises(DsaParamsError):
            load_dsa_params(environ={}, vault_dir=self.vault)

    def test_partial_vault_still_requires_every_key(self):
        self._write_vault({"lambda": 0.1})
        with self.assertRaises(DsaParamsError):
            load_dsa_params(environ={"DSA_GAMMA": "0.2"}, vault_dir=self.vault)

    def test_invalid_values_rejected(self):
        self._write_vault({"lambda": "abc", "gamma": 0.2, "min_weight": 0.3})
        with self.assertRaises(DsaParamsError):
            load_dsa_params(environ={}, vault_dir=self.vault)
        with self.assertRaises(DsaParamsError):
            load_dsa_params(environ={"DSA_LAMBDA": "-1", "DSA_GAMMA": "0.2", "DSA_MIN_WEIGHT": "0.3"}, vault_dir=self.vault)

    def test_vault_dir_env_override(self):
        found = find_vault_dir(environ={"DSA_VAULT_DIR": str(self.vault)})
        self.assertEqual(found, self.vault)

    def test_real_vault_loads_when_present(self):
        real = find_vault_dir()
        if real is None or not (real / "params" / "dsa_params.json").is_file():
            self.skipTest("گاوصندوق DSA روی این ماشین نیست")
        params = load_dsa_params()
        self.assertEqual(set(params), {"lambda", "gamma", "min_weight"})
        self.assertTrue(all(isinstance(v, float) and v >= 0 for v in params.values()))


if __name__ == "__main__":
    unittest.main()
