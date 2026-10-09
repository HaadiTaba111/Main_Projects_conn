// tests/cube_preview.test.mjs — تست مکعب سه‌بعدی لیریکس (بدون مرورگر)
//
// اجرا:  node tests/cube_preview.test.mjs
// هدف: مطمئن شویم ماژول مکعب در چیدمان واقعی استودیو (شش وجه + canvas ذرات + کادر لیریکس)
//       بالا می‌آید، با خطوط سینک می‌شود، با تغییر رنگ/اندازه به‌روز می‌شود و
//       در localStorage ذخیره می‌گردد.

import assert from "node:assert/strict";

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  ❌ ${name}\n     ${error.message}`);
  }
}

// ===== DOM ساختگی =====

function makeEl(extra = {}) {
  const classes = new Set();
  const el = {
    textContent: "",
    innerHTML: "",
    value: "",
    hidden: false,
    dataset: {},
    children: [],
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, force) => (force ? classes.add(c) : classes.delete(c))
    },
    addEventListener() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeAttribute() {},
    setAttribute() {}
  };
  return Object.assign(el, extra);
}

const faceNames = ["front", "back", "right", "left", "top", "bottom"];
const cubeTextEls = {};
const faceEls = {};
for (const face of faceNames) {
  const textEl = makeEl();
  cubeTextEls[face] = textEl;
  faceEls[face] = makeEl({ querySelector: (sel) => (sel === ".cube-text, .lyric-text" ? textEl : null) });
}
const cubeEl = makeEl({
  querySelector: (sel) => {
    const match = /^\.face-(\w+)$/.exec(sel);
    return match ? faceEls[match[1]] || null : null;
  }
});
const stageEl = makeEl();
const controlsEl = makeEl();
const toggleBtn = makeEl();
const colorInput = makeEl({ value: "#ff0055" });
const textColorInput = makeEl({ value: "#ffffff" });
const sizeInput = makeEl({ value: "300" });
const speedInput = makeEl({ value: "3" });
const lyricsBox = makeEl({ value: "[00:01.00] خط اول\n[00:05.50] خط دوم\n[00:09.25] خط سوم" });
const particleCanvas = makeEl({ getContext: () => null, offsetWidth: 320, offsetHeight: 320 });

const registry = new Map([
  ["lyricsCube", cubeEl],
  ["cubeStage", stageEl],
  ["cubeControls", controlsEl],
  ["btnCubeToggle", toggleBtn],
  ["cubeColorInput", colorInput],
  ["cubeTextColorInput", textColorInput],
  ["cubeSizeInput", sizeInput],
  ["cubeRotSpeedInput", speedInput],
  ["lyricsBox", lyricsBox],
  ["particleCanvas", particleCanvas]
]);

const listeners = new Map();
const documentStub = {
  readyState: "complete",
  getElementById: (id) => registry.get(id) || null,
  addEventListener: (type, handler) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(handler);
  },
  dispatchEvent: (event) => {
    (listeners.get(event.type) || []).forEach((handler) => handler(event));
    return true;
  },
  createElement: () => makeEl()
};

const storage = new Map();
const rafQueue = [];
const frames = { list: [] };

if (!globalThis.CustomEvent) {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  };
}

globalThis.document = documentStub;
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
};
globalThis.requestAnimationFrame = (cb) => {
  rafQueue.push(cb);
  return rafQueue.length;
};
globalThis.addEventListener = () => {};

const { setupLyraXCube } = await import("../static/js/cube/cube-preview.js");

const cube = setupLyraXCube();

console.log("\n🎲 تست مکعب سه‌بعدی لیریکس (LyraX Cube)");

test("ماژول بالا می‌آید و روی window.LyraXCube سوار می‌شود", () => {
  assert.ok(cube, "setupLyraXCube باید یک API برگرداند");
  assert.equal(typeof globalThis.LyraXCube.jumpToLine, "function");
});

test("از کادر لیریکس خطوط را می‌خواند (تایم‌استمپ حذف می‌شود)", () => {
  const lines = cube.getLines();
  assert.deepEqual(lines, ["خط اول", "خط دوم", "خط سوم"]);
});

test("فقط وجه خط جاری متن دارد؛ بقیه‌ی وجه‌ها خالی می‌مانند", () => {
  cube.jumpToLine(1);
  assert.equal(cube.renderer.currentLine, 1);
  // در حالت پایین‌به‌بالا خط دوم روی وجه «bottom» می‌نشیند (از پایین بالا آمده)
  assert.equal(cubeTextEls.bottom.textContent, "خط دوم");
  assert.equal(cube.renderer.getState().visibleFace, "bottom");
  assert.ok(faceEls.bottom.classList.contains("active"), "وجه خط جاری باید active باشد");
  const painted = Object.entries(cubeTextEls).filter(([, el]) => el.textContent);
  assert.deepEqual(painted.map(([name]) => name), ["bottom"], "فقط یک وجه باید متن داشته باشد");
  assert.ok(!faceEls.front.classList.contains("active"), "بقیه‌ی وجه‌ها باید غیرفعال باشند");
});

test("مکعب با هر خط ۹۰ درجه رو به بالا می‌چرخد (زاویه انباشته و یک‌طرفه)", () => {
  documentStub.dispatchEvent(new CustomEvent("lyrax:lines", { detail: { lines: ["۱", "۲", "۳", "۴", "۵"] } }));
  const angles = [0, 1, 2, 3, 4].map((index) => {
    cube.jumpToLine(index);
    return cube.renderer.getState().targetRotation.x;
  });
  assert.deepEqual(angles, [0, 90, 180, 270, 360]);
  const faces = [0, 1, 2, 3, 4].map((index) => {
    cube.jumpToLine(index);
    return cube.renderer.getState().visibleFace;
  });
  assert.deepEqual(faces, ["front", "bottom", "back", "top", "front"]);
  documentStub.dispatchEvent(new CustomEvent("lyrax:lines", { detail: { lines: ["خط اول", "خط دوم", "خط سوم"] } }));
  cube.jumpToLine(0);
});

test("زاویه‌ی چرخش مکعب برای هر خط قطعی و تکرارپذیر است", () => {
  cube.jumpToLine(3);
  const first = cube.renderer.getState().targetRotation;
  cube.jumpToLine(1);
  cube.jumpToLine(3);
  assert.deepEqual(cube.renderer.getState().targetRotation, first);
});

test("پرش خارج از محدوده به نزدیک‌ترین خط معتبر می‌چسبد", () => {
  cube.jumpToLine(99);
  assert.equal(cube.renderer.currentLine, 2);
  cube.jumpToLine(-5);
  assert.equal(cube.renderer.currentLine, 0);
});

test("رویداد lyrax:line استودیو مکعب را جلو می‌برد", () => {
  cube.jumpToLine(0);
  documentStub.dispatchEvent(new CustomEvent("lyrax:line", { detail: { index: 2 } }));
  assert.equal(cube.renderer.currentLine, 2);
});

test("رویداد lyrax:lines خطوط تازه را جایگزین می‌کند", () => {
  documentStub.dispatchEvent(new CustomEvent("lyrax:lines", { detail: { lines: ["یک", "دو"] } }));
  assert.deepEqual(cube.getLines(), ["یک", "دو"]);
  cube.jumpToLine(0);
  assert.equal(cubeTextEls.front.textContent, "یک");
});

test("کلمه‌ی *ویژه* روی وجه، زرد/درشت (lyra-hl) رندر می‌شود", () => {
  documentStub.dispatchEvent(new CustomEvent("lyrax:lines", { detail: { lines: ["این یک *تست* است"] } }));
  cube.jumpToLine(0);
  const html = cubeTextEls.front.innerHTML;
  assert.ok(html.includes('class="lyra-hl"'), html);
  assert.ok(html.includes("تست"), html);

  documentStub.dispatchEvent(new CustomEvent("lyrax:lines", { detail: { lines: ["خط ساده"] } }));
  cube.jumpToLine(0);
  assert.equal(cubeTextEls.front.textContent, "خط ساده");
});

test("حالت چرخش آزاد (free) هم پشتیبانی می‌شود و باز هم تک‌وجهی می‌ماند", () => {
  cube.jumpToLine(0);
  cube.setRotationMode("free");
  assert.equal(cube.renderer.rotationMode, "free");
  cube.jumpToLine(2);
  const painted = Object.entries(cubeTextEls).filter(([, el]) => el.textContent);
  assert.equal(painted.length, 1, "در حالت آزاد هم فقط وجه روبه‌رو متن دارد");
  cube.setRotationMode("bottom_up");
  assert.equal(cube.renderer.rotationMode, "bottom_up");
  cube.jumpToLine(0);
});

documentStub.dispatchEvent(new CustomEvent("lyrax:lines", { detail: { lines: ["خط اول", "خط دوم", "خط سوم"] } }));

test("دکمه‌ی نمایش/مخفی‌کردن مکعب، پنل و کنترل‌ها را هم‌زمان باز می‌کند", () => {
  assert.equal(cube.toggle(true), true);
  assert.equal(stageEl.hidden, false);
  assert.equal(controlsEl.hidden, false);
  assert.equal(cube.isVisible(), true);
  cube.toggle(false);
  assert.equal(stageEl.hidden, true);
  assert.equal(controlsEl.hidden, true);
  assert.equal(cube.isVisible(), false);
});

test("رنگ، اندازه و سرعت چرخش روی مکعب و در localStorage ثبت می‌شوند", () => {
  cube.setColors("#00ff88", "#101010");
  cube.setSize(360);
  cube.setSpeed(0.5);
  assert.equal(faceEls.front.style.borderColor, "rgba(0,255,136,0.5)");
  assert.equal(faceEls.front.style.color, "#101010");
  assert.equal(cubeEl.style.width, "360px");
  assert.equal(faceEls.top.style.transform, "rotateX(90deg) translateZ(180px)");
  const saved = JSON.parse(storage.get("lyrax.cube.settings"));
  assert.equal(saved.cubeColor, "#00ff88");
  assert.equal(saved.size, 360);
  assert.equal(saved.speed, 0.5);
});

test("حلقه‌ی انیمیشن مکعب در نبود requestAnimationFrame خطا نمی‌دهد", () => {
  const pending = rafQueue.splice(0, rafQueue.length);
  for (const frame of pending) frame();
  assert.equal(typeof cubeEl.style.transform, "string");
  assert.ok(cubeEl.style.transform.includes("rotateX"));
});

test("canvas ذرات بدون context دوباره خطا نمی‌دهد", () => {
  assert.equal(cube.particles.ctx, null);
  assert.equal(cube.particles.destroyed, false);
  cube.particles.destroy();
  assert.equal(cube.particles.destroyed, true);
});

if (failures > 0) {
  console.error(`\n❌ ${failures} تست مکعب شکست خورد`);
  process.exit(1);
}
console.log("\n🎉 همه تست‌های مکعب سه‌بعدی لیریکس سبز شدند!\n");
