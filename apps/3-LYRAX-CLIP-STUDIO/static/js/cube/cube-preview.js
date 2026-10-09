// js/cube/cube-preview.js — پل بین استودیو لیراکس و مکعب سه‌بعدی (LyraX Cube)
//
// کار این ماژول:
//   ۱. ساختن مکعب سه‌بعدی + ذرات پس‌زمینه در پیش‌نمایش استودیو
//   ۲. گوش دادن به رویدادهای استودیو (lyrax:lines / lyrax:line) و سینک کردن مکعب با خط لیریکس
//   ۳. اگر استودیو رویدادی نفرستد، خودش متن کادر لیریکس (#lyricsBox) را می‌خواند (فالبک)
//   ۴. ذخیره‌ی رنگ/اندازه/وضعیت نمایش در localStorage
//
// دسترسی از داخل خود صفحه:  window.LyraXCube.jumpToLine(12)

import { CubeRenderer } from "./CubeRenderer.js";
import { ParticleSystem } from "./ParticleSystem.js";

const STORAGE_KEY = "lyrax.cube.settings";
const LRC_TIME_RE = /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g;

const DEFAULTS = {
  visible: false,
  cubeColor: "#ff0055",
  textColor: "#ffffff",
  size: 300,
  speed: 0.25,
  // چرخش از پایین به بالا: هر خط ۹۰ درجه رو به بالا
  rotationMode: "bottom_up",
  // فقط وجه خط جاری متن دارد («فقط صفحه‌ی خط لیریکس با آهنگ»)
  singleFace: true
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (error) {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    /* حافظه‌ی محلی در حالت private در دسترس نیست؛ بی‌خیال می‌شویم */
  }
}

/** خواندن خطوط از کادر لیریکس (تایم‌استمپ‌های LRC حذف می‌شوند). */
function readLinesFromLyricsBox() {
  const box = document.getElementById("lyricsBox");
  if (!box || !box.value) return [];
  return box.value
    .split("\n")
    .map((line) => line.replace(LRC_TIME_RE, "").trim())
    .filter(Boolean);
}

export function setupLyraXCube() {
  const cubeEl = document.getElementById("lyricsCube");
  const stageEl = document.getElementById("cubeStage");
  if (!cubeEl || !stageEl) {
    // صفحه‌ی مکعب در این چیدمان وجود ندارد؛ بی‌صدا خارج می‌شویم.
    return null;
  }

  const settings = loadSettings();
  const renderer = new CubeRenderer(cubeEl, {
    size: settings.size,
    color: settings.cubeColor,
    textColor: settings.textColor,
    speed: settings.speed,
    rotationMode: settings.rotationMode,
    singleFace: settings.singleFace
  });
  const particles = new ParticleSystem("particleCanvas");

  const controlsEl = document.getElementById("cubeControls");
  const toggleBtn = document.getElementById("btnCubeToggle");
  const colorInput = document.getElementById("cubeColorInput");
  const textColorInput = document.getElementById("cubeTextColorInput");
  const sizeInput = document.getElementById("cubeSizeInput");
  const speedInput = document.getElementById("cubeRotSpeedInput");

  if (colorInput) colorInput.value = settings.cubeColor;
  if (textColorInput) textColorInput.value = settings.textColor;
  if (sizeInput) sizeInput.value = String(settings.size);
  if (speedInput) speedInput.value = String(Math.max(1, Math.round(settings.speed * 10)));

  function applyVisibility(visible, persist = true) {
    const show = Boolean(visible);
    stageEl.hidden = !show;
    stageEl.classList.toggle("is-visible", show);
    if (controlsEl) controlsEl.hidden = !show;
    if (toggleBtn) {
      toggleBtn.textContent = show ? "🎲 مخفی کردن مکعب" : "🎲 نمایش مکعب سه‌بعدی";
      toggleBtn.classList.toggle("is-on", show);
    }
    settings.visible = show;
    if (persist) saveSettings(settings);
    if (show && renderer.getLines().length === 0) setLines(readLinesFromLyricsBox());
    return show;
  }

  function setLines(lines) {
    renderer.setLines(lines || []);
    return renderer.getLines();
  }

  function jumpToLine(index) {
    renderer.jumpToLine(index);
    return renderer.currentLine;
  }

  function next() {
    renderer.nextLine();
    return renderer.currentLine;
  }

  function setColors(cubeColor, textColor) {
    if (cubeColor) {
      settings.cubeColor = cubeColor;
      if (colorInput) colorInput.value = cubeColor;
    }
    if (textColor) {
      settings.textColor = textColor;
      if (textColorInput) textColorInput.value = textColor;
    }
    renderer.setColors(settings.cubeColor, settings.textColor);
    saveSettings(settings);
  }

  function setSize(size) {
    const value = Number(size);
    if (!Number.isFinite(value) || value <= 0) return renderer.cubeSize;
    settings.size = value;
    if (sizeInput) sizeInput.value = String(value);
    renderer.setCubeSize(value);
    saveSettings(settings);
  }

  function setSpeed(speed) {
    const value = Number(speed);
    if (!Number.isFinite(value) || value <= 0) return renderer.autoRotateSpeed;
    settings.speed = value;
    renderer.setSpeed(value);
    saveSettings(settings);
    return value;
  }

  // ===== کنترل‌های رابط کاربری =====
  if (toggleBtn) toggleBtn.addEventListener("click", () => applyVisibility(!settings.visible));
  if (colorInput) colorInput.addEventListener("input", () => setColors(colorInput.value, null));
  if (textColorInput) textColorInput.addEventListener("input", () => setColors(null, textColorInput.value));
  if (sizeInput) sizeInput.addEventListener("input", () => setSize(sizeInput.value));
  if (speedInput) speedInput.addEventListener("input", () => setSpeed(Number(speedInput.value) / 10));

  // ===== گوش دادن به رویدادهای استودیو =====
  document.addEventListener("lyrax:lines", (event) => {
    const lines = event?.detail?.lines;
    if (Array.isArray(lines)) setLines(lines);
  });
  document.addEventListener("lyrax:line", (event) => {
    const index = event?.detail?.index;
    if (Number.isFinite(Number(index))) jumpToLine(Number(index));
  });

  // فالبک: اگر استودیو رویدادی نفرستد، از کادر لیریکس می‌خوانیم.
  const lyricsBox = document.getElementById("lyricsBox");
  if (lyricsBox) {
    lyricsBox.addEventListener("change", () => setLines(readLinesFromLyricsBox()));
  }
  setLines(readLinesFromLyricsBox());

  function setRotationMode(mode) {
    settings.rotationMode = mode === "free" ? "free" : "bottom_up";
    renderer.setRotationMode(settings.rotationMode);
    saveSettings(settings);
    return settings.rotationMode;
  }

  /** انتخاب پریست استایل لیریکس: 'cube_3d_bottom_up' مکعب را روشن می‌کند، بقیه خاموش. */
  function setStylePreset(preset) {
    if (preset === "cube_3d_bottom_up" || preset === "cube_3d_vertical") {
      applyVisibility(true);
      renderer.setRotationMode("bottom_up");
    } else if (settings.visible) {
      applyVisibility(false);
    }
    return Boolean(settings.visible);
  }

  const api = {
    renderer,
    particles,
    setLines,
    setRotationMode,
    setStylePreset,
    jumpToLine,
    next,
    toggle: (force) => applyVisibility(force === undefined ? !settings.visible : force),
    isVisible: () => Boolean(settings.visible),
    setColors,
    setSize,
    setSpeed,
    getLines: () => renderer.getLines(),
    getState: () => ({ ...renderer.getState(), visible: Boolean(settings.visible) })
  };

  window.LyraXCube = api;
  applyVisibility(settings.visible, false);
  return api;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setupLyraXCube());
  } else {
    setupLyraXCube();
  }
}

export default setupLyraXCube;
