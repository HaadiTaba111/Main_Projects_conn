import { DEFAULT_SETTINGS, RISK_PROFILES, STORAGE_KEYS } from '../core/config.js';
import { clone, readJson, writeJson } from '../core/utils.js';

/**
 * مهاجرت یک‌باره‌ی تنظیمات ذخیره‌شده. فقط وقتی اجرا می‌شود که نسخهٔ شِمای ذخیره‌شده
 * کمتر از نسخهٔ فعلی باشد؛ بعد از ذخیره، دیگر تکرار نمی‌شود و انتخاب کاربر دست‌نخورده می‌ماند.
 *  - نسخه ۱ (قبل از این تغییر): پیش‌فرض تایم‌فریم ۶۰ بود؛ مقدار ذخیره‌شدهٔ «۶۰» به «۱۵» می‌رود.
 */
export function migrateSettings(saved = {}) {
  const out = { ...saved };
  const from = Number(saved.settingsVersion) || 1;
  if (from < 2 && String(saved.timeframe) === '60') out.timeframe = '15';
  out.settingsVersion = DEFAULT_SETTINGS.settingsVersion;
  return out;
}

export class SettingsStore {
  constructor() {
    const saved = readJson(STORAGE_KEYS.settings, {});
    this.value = { ...clone(DEFAULT_SETTINGS), ...migrateSettings(saved && typeof saved === 'object' ? saved : {}) };
  }

  save(next = this.value) {
    this.value = { ...clone(DEFAULT_SETTINGS), ...next };
    writeJson(STORAGE_KEYS.settings, this.value);
  }

  applyRiskProfile(profile = 'medium') {
    const selected = RISK_PROFILES[profile] ? profile : 'medium';
    this.save({ ...this.value, ...clone(RISK_PROFILES[selected]), riskProfile: selected });
  }

  reset() {
    this.save(clone(DEFAULT_SETTINGS));
  }
}
