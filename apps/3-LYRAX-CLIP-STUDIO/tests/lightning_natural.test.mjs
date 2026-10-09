// tests/lightning_natural.test.mjs — تطابق هندسی رعد طبیعی: مرورگر (JS) با بک‌اند (Python)
//
// اجرا:  node tests/lightning_natural.test.mjs
// مقادیر مورد انتظار از natural_bolt_polylines() در Python گرفته شده‌اند.
import assert from "node:assert/strict";
import { naturalBoltPaths, createManualEvent } from "../static/js/effects/lightning.js";

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); }
  catch (error) { failures += 1; console.error(`  ❌ ${name}\n     ${error.message}`); }
}

const round3 = (v) => Math.round(v * 1000) / 1000;

test("مسیر چپ (seed=12345, شاخه=4، گستردگی=1) با Python یکسان است", () => {
  const paths = naturalBoltPaths(1920, 1080, "left", 12345, { naturalBranches: 4, naturalSpread: 1.0 });
  assert.equal(paths.length, 5);
  assert.deepEqual(paths.map((p) => p.points.length), [129, 17, 9, 9, 17]);
  assert.deepEqual(paths[0].points.slice(0, 4).map((p) => [round3(p.x), round3(p.y)]),
    [[154, 22], [155.417, 25.071], [158.647, 28.812], [162.964, 33.642]]);
  const last = paths[0].points.at(-1);
  assert.deepEqual([round3(last.x), round3(last.y)], [907.715, 602.246]);
});

test("مسیر راست (seed=777، شاخه=2، گستردگی=1.5) با Python یکسان است", () => {
  const paths = naturalBoltPaths(1920, 1080, "right", 777, { naturalBranches: 2, naturalSpread: 1.5 });
  assert.equal(paths.length, 2);
  assert.deepEqual(paths.map((p) => p.points.length), [257, 65]);
  assert.deepEqual(paths[0].points.slice(0, 2).map((p) => [round3(p.x), round3(p.y)]), [[1766, 22], [1761.597, 25.092]]);
  const last = paths[0].points.at(-1);
  assert.deepEqual([round3(last.x), round3(last.y)], [1046.691, 723.206]);
});

test("شاخه‌ها نازک‌تر از تنهٔ اصلی هستند", () => {
  const paths = naturalBoltPaths(1920, 1080, "left", 12345, {});
  assert.equal(paths[0].scale, 1);
  for (const branch of paths.slice(1)) assert.equal(branch.scale, 0.6);
});

test("کلید تریگر دستی tier-4 به رعد طبیعی تبدیل می‌شود", () => {
  const event = createManualEvent({ layer: {}, time: 2.5, triggerId: "tier-4", runtime: {} });
  assert.equal(event.tier, 4);
  assert.equal(event.source, "manual");
});

if (failures) { console.error(`\n${failures} تست ناموفق`); process.exit(1); }
console.log("\n🎉 همه تست‌های رعد طبیعی سبز شدند!");
