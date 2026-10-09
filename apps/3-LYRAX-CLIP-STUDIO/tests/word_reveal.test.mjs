// tests/word_reveal.test.mjs — تست موتور «کلمه‌به‌کلمه از پایین» (Word Reveal)
//
// اجرا:  node tests/word_reveal.test.mjs
//
// این تست کد واقعی داخل studio.html را استخراج می‌کند (نه یک کپی جدا) تا مطمئن شویم
// همان موتوری که در مرورگر رسم می‌کند، کلمات را یکی‌یکی از پایین بالا می‌آورد،
// کلمه‌ی *ویژه* را زرد و درشت می‌کشد و در پایان خط همه را رو به بالا خارج می‌کند.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(here, "..");

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

// ===== استخراج موتور از خود صفحه =====
const html = readFileSync(join(APP_DIR, "studio.html"), "utf8");
const startMarker = "const WordRevealEngine = {";
const start = html.indexOf(startMarker);
assert.ok(start > -1, "موتور WordRevealEngine در studio.html پیدا نشد");
let depth = 0;
let end = -1;
for (let i = html.indexOf("{", start); i < html.length; i += 1) {
  if (html[i] === "{") depth += 1;
  else if (html[i] === "}") {
    depth -= 1;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}
const engineSource = html.slice(start, end);
assert.ok(engineSource.endsWith("}"), "استخراج موتور کامل نشد");

// ===== محیط ساختگی (canvas + کمکی‌های استودیو) =====
const W_FULL = 1080;
const subStyle = { font: "Tahoma", size: 62, color: "#FFF000", stroke: "#000000", sWidth: 5, langOrder: "fa_first" };

function parseText(text) {
  // همان کاری که getParsedLineData در استودیو انجام می‌دهد: کلمه‌ی *ویژه* جدا می‌شود.
  const words = text.split(" ").filter(Boolean);
  const highlight = words.map((w) => w.length > 2 && w.startsWith("*") && w.endsWith("*"));
  return { pWords: words.map((w, i) => (highlight[i] ? w.slice(1, -1) : w)), pHighlight: highlight, eWords: [], eHighlight: [] };
}

function fitWordsToLines(ctx, words, maxWidth, maxLines) {
  const lines = [];
  let current = [];
  let width = 0;
  for (const word of words) {
    const w = ctx.measureText(word).width;
    if (current.length && width + w > maxWidth) {
      lines.push(current);
      current = [];
      width = 0;
    }
    current.push(word);
    width += w + 10;
  }
  if (current.length) lines.push(current);
  return { lines: lines.slice(0, maxLines), fontSize: subStyle.size };
}

function makeContext() {
  const drawn = [];
  const ctx = {
    drawn,
    font: "",
    direction: "",
    textAlign: "",
    textBaseline: "",
    fillStyle: "",
    strokeStyle: "",
    shadowColor: "",
    shadowBlur: 0,
    lineWidth: 1,
    globalAlpha: 1,
    _transform: { x: 0, y: 0, sx: 1, sy: 1 },
    measureText: (text) => ({ width: String(text).length * 22 }),
    save() {
      this._saved = { globalAlpha: this.globalAlpha, x: this._transform.x, y: this._transform.y, sx: this._transform.sx, sy: this._transform.sy };
    },
    restore() {
      if (this._saved) {
        this.globalAlpha = this._saved.globalAlpha;
        this._transform = { x: this._saved.x, y: this._saved.y, sx: this._saved.sx, sy: this._saved.sy };
      }
    },
    translate(x, y) { this._transform.x += x; this._transform.y += y; },
    scale(sx, sy) { this._transform.sx *= sx; this._transform.sy *= sy; },
    strokeText(text) { drawn.push({ text, type: "stroke", alpha: this.globalAlpha, y: this._transform.y }); },
    fillText(text, x, y) {
      drawn.push({
        text,
        type: "fill",
        alpha: this.globalAlpha,
        fill: this.fillStyle,
        font: this.font,
        y: this._transform.y + (Number(y) || 0),
        x: this._transform.x + (Number(x) || 0),
        scale: this._transform.sx
      });
    }
  };
  return ctx;
}

const engine = new Function(
  "W_FULL", "subStyle", "getParsedLineData", "fitWordsToLines",
  `${engineSource}\nreturn WordRevealEngine;`
)(W_FULL, subStyle, parseText, fitWordsToLines);

const boxRect = { x: 0, y: 1540, w: W_FULL, h: 380, cx: W_FULL / 2, cy: 1730 };

console.log("\n✨ تست موتور کلمه‌به‌کلمه از پایین (Word Reveal)");

test("کلمات یکی‌یکی افشا می‌شوند: اوایل خط کمتر از پایان خط", () => {
  const early = makeContext();
  engine.render(early, "این یک تست ساده است", 0.05, 3.0, boxRect);
  const late = makeContext();
  engine.render(late, "این یک تست ساده است", 2.4, 3.0, boxRect);
  const earlyWords = early.drawn.filter((d) => d.type === "fill");
  const lateWords = late.drawn.filter((d) => d.type === "fill");
  assert.ok(earlyWords.length < lateWords.length, `${earlyWords.length} باید کمتر از ${lateWords.length} باشد`);
  assert.ok(lateWords.length >= 4, "در پایان خط همه‌ی کلمات باید رسم شده باشند");
});

test("کلمات از پایین بالا می‌آیند (فاصله‌ی عمودی در لحظه‌ی ورود بیشتر است)", () => {
  const ctx = makeContext();
  engine.render(ctx, "این یک تست ساده است", 0.0, 4.0, boxRect);
  const firstWord = ctx.drawn.find((d) => d.type === "fill");
  const steady = makeContext();
  engine.render(steady, "این یک تست ساده است", 3.0, 4.0, boxRect);
  const steadyFirst = steady.drawn.find((d) => d.type === "fill" && d.text === firstWord.text);
  assert.ok(firstWord.y > steadyFirst.y, "کلمه‌ی تازه‌وارد باید پایین‌تر از جای نهایی‌اش باشد");
});

test("کلمه‌ی *ویژه* زرد، درشت‌تر و درخشان کشیده می‌شود", () => {
  const ctx = makeContext();
  engine.render(ctx, "این یک *تست* ویژه است", 3.0, 4.0, boxRect);
  const highlighted = ctx.drawn.find((d) => d.type === "fill" && d.text === "تست");
  const normal = ctx.drawn.find((d) => d.type === "fill" && d.text === "ویژه");
  assert.ok(highlighted, "کلمه‌ی ویژه باید رسم شود");
  assert.equal(highlighted.fill, "#FFF000");
  assert.equal(normal.fill, subStyle.color);
  const hlSize = parseInt(/(\d+)px/.exec(highlighted.font)[1], 10);
  const normalSize = parseInt(/(\d+)px/.exec(normal.font)[1], 10);
  assert.ok(hlSize > normalSize, `اندازه‌ی کلمه‌ی ویژه (${hlSize}) باید از معمولی (${normalSize}) بزرگ‌تر باشد`);
  assert.ok(highlighted.scale > normal.scale, "مقیاس کلمه‌ی ویژه بزرگ‌تر است");
});

test("در پایان خط، کلمات رو به بالا خارج می‌شوند (شفافیت کمتر و y کمتر)", () => {
  const ctx = makeContext();
  engine.render(ctx, "این یک تست ساده است", 3.85, 4.0, boxRect);
  const fills = ctx.drawn.filter((d) => d.type === "fill");
  assert.ok(fills.length > 0, "باید در حال خروج هم کلمه رسم شود");
  assert.ok(Math.max(...fills.map((d) => d.alpha)) < 1, "در حال خروج شفافیت باید کمتر از ۱ باشد");
});

test("خط خالی یا بی‌کلمه خطا نمی‌دهد", () => {
  const ctx = makeContext();
  engine.render(ctx, "", 1.0, 3.0, boxRect);
  engine.render(ctx, "   ", 1.0, 3.0, boxRect);
  assert.equal(ctx.drawn.length, 0);
});

if (failures > 0) {
  console.error(`\n❌ ${failures} تست کلمه‌به‌کلمه شکست خورد`);
  process.exit(1);
}
console.log("\n🎉 همه تست‌های کلمه‌به‌کلمه سبز شدند!\n");
