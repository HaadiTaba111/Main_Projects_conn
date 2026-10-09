// app.js — Main application controller

import { parseLyrics, formatTime } from "./lyricsParser.js";
import { CubeRenderer } from "./cubeRenderer.js";
import { ParticleSystem, VisualizerRings } from "./particles.js";
import { VideoExporter } from "./videoExporter.js";

// DOM refs
const audioInput   = document.getElementById("audioInput");
const lyricsInput  = document.getElementById("lyricsInput");
const btnPlay      = document.getElementById("btnPlay");
const btnStop      = document.getElementById("btnStop");
const btnExport    = document.getElementById("btnExport");
const rotSpeed     = document.getElementById("rotSpeed");
const cubeColor    = document.getElementById("cubeColor");
const textColor    = document.getElementById("textColor");
const cubeSize     = document.getElementById("cubeSize");
const statusEl     = document.getElementById("status");
const timeDisplay  = document.getElementById("timeDisplay");
const audioEl      = document.getElementById("audioEl");
const cubeEl       = document.getElementById("lyricsCube");
const exportCanvas = document.getElementById("exportCanvas");

// Systems
const cubeRenderer = new CubeRenderer(cubeEl, {
  speed: 0.3,
  size: parseInt(cubeSize.value, 10),
  color: cubeColor.value,
  textColor: textColor.value,
  // پایین ➜ بالا: هر خط ۹۰ درجه رو به بالا؛ فقط وجه خط جاری متن دارد.
  rotationMode: "bottom_up",
  singleFace: true
});

const particles = new ParticleSystem("particleCanvas");
let vizRings = new VisualizerRings("vizCanvas", null);

let audioCtx = null;
let analyser = null;
let sourceNode = null;
let lyricsData = [];
let isPlaying = false;
let exportMode = false;
let lastLineIndex = -1;
let exporter = new VideoExporter(exportCanvas, 30);

// ===== Event Listeners =====

audioInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  audioEl.src = url;
  statusEl.textContent = `آهنگ بارگذاری شد: ${file.name}`;
});

cubeSize.addEventListener("input", () => cubeRenderer.setCubeSize(parseInt(cubeSize.value, 10)));

cubeColor.addEventListener("input", () => cubeRenderer.setColors(cubeColor.value, textColor.value));
textColor.addEventListener("input", () => cubeRenderer.setColors(cubeColor.value, textColor.value));

btnPlay.addEventListener("click", async () => {
  if (!audioEl.src) {
    statusEl.textContent = "لطفاً ابتدا یک فایل صوتی انتخاب کنید";
    return;
  }
  lyricsData = parseLyrics(lyricsInput.value, audioEl.duration || 60);
  if (lyricsData.length === 0) {
    statusEl.textContent = "لطفاً متن لیریکس وارد کنید";
    return;
  }
  cubeRenderer.setLines(lyricsData);
  await initAudioContext();
  audioEl.play();
  isPlaying = true;
  statusEl.textContent = "در حال پخش...";
  loop();
});

btnStop.addEventListener("click", () => {
  audioEl.pause();
  audioEl.currentTime = 0;
  isPlaying = false;
  lastLineIndex = -1;
  statusEl.textContent = "توقف";
});

btnExport.addEventListener("click", () => {
  if (!audioEl.src) {
    statusEl.textContent = "ابتدا آهنگ را بارگذاری کنید";
    return;
  }
  lyricsData = parseLyrics(lyricsInput.value, audioEl.duration || 60);
  if (lyricsData.length === 0) {
    statusEl.textContent = "ابتدا لیریکس را وارد کنید";
    return;
  }
  toggleExportMode();
});

// ===== Keyboard Navigation (خط بعدی با کلید، مکعب رو به بالا می‌چرخد) =====
function goToLine(index) {
  if (lyricsData.length === 0) {
    statusEl.textContent = "ابتدا لیریکس را وارد کن";
    return;
  }
  const target = Math.max(0, Math.min(index, lyricsData.length - 1));
  cubeRenderer.jumpToLine(target);
  lastLineIndex = target;
  const startTime = Number(lyricsData[target]?.time);
  if (Number.isFinite(startTime) && audioEl.src) {
    try { audioEl.currentTime = Math.max(0, startTime); } catch (error) { /* بدون پرش ادامه بده */ }
  }
  statusEl.textContent = `خط ${target + 1} از ${lyricsData.length}`;
}

window.addEventListener("keydown", (event) => {
  const tag = (event.target && event.target.tagName) || "";
  if (tag === "TEXTAREA" || tag === "INPUT") return;
  if (["Space", "Enter", "ArrowDown", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
    goToLine(lastLineIndex + 1);
  } else if (["ArrowUp", "ArrowLeft"].includes(event.code)) {
    event.preventDefault();
    goToLine(lastLineIndex - 1);
  }
});

// ===== Audio Context =====

async function initAudioContext() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  sourceNode = audioCtx.createMediaElementSource(audioEl);
  sourceNode.connect(analyser);
  analyser.connect(audioCtx.destination);
  vizRings.setAnalyser(analyser);
}

// ===== Main Loop =====

function loop() {
  if (!isPlaying) return;

  const currentTime = audioEl.currentTime;
  const duration = audioEl.duration || 1;
  timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;

  // Find current line
  let activeIndex = 0;
  for (let i = lyricsData.length - 1; i >= 0; i--) {
    if (currentTime >= lyricsData[i].time) {
      activeIndex = i;
      break;
    }
  }

  if (activeIndex !== lastLineIndex) {
    cubeRenderer.jumpToLine(activeIndex); // فقط وجه خط جاری؛ چرخش رو به بالا
    lastLineIndex = activeIndex;
  }

  // Update auto-rotate speed from slider
  cubeRenderer.autoRotateSpeed = parseInt(rotSpeed.value, 10) * 0.08;

  // Export mode: draw to export canvas
  if (exportMode) {
    drawExportFrame();
  }

  if (currentTime >= duration) {
    isPlaying = false;
    if (exportMode) {
      exporter.stop();
      exportMode = false;
      statusEl.textContent = "خروجی ویدیویی ذخیره شد";
    }
    return;
  }

  requestAnimationFrame(loop);
}

// ===== Export Mode =====

function toggleExportMode() {
  exportMode = !exportMode;
  if (exportMode) {
    statusEl.textContent = "در حال ضبط ویدیو...";
    exporter.start();
    audioEl.currentTime = 0;
    audioEl.play();
    isPlaying = true;
    lastLineIndex = -1;
    loop();
  } else {
    exporter.stop();
    statusEl.textContent = "ضبط متوقف شد";
  }
}

/**
 * Draw the current 3D cube state to the export canvas (1080x1920 vertical).
 * This creates a high-res frame for video export.
 */
function drawExportFrame() {
  const ctx = exportCanvas.getContext("2d");
  const w = exportCanvas.width;
  const h = exportCanvas.height;

  // Background
  const grad = ctx.createRadialGradient(w / 2, h / 2, 100, w / 2, h / 2, h * 0.7);
  grad.addColorStop(0, "#1a0b2e");
  grad.addColorStop(1, "#0a0a12");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Simple cube representation for export
  const cx = w / 2;
  const cy = h / 2;
  const size = parseInt(cubeSize.value, 10) * 1.8;
  const half = size / 2;

  ctx.save();
  ctx.translate(cx, cy);

  // Get current rotation
  const rx = cubeRenderer.rotation.x * Math.PI / 180;
  const ry = cubeRenderer.rotation.y * Math.PI / 180;

  // Cube vertices
  const verts = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
  ];

  function rotateX(v, angle) {
    const y = v[1] * Math.cos(angle) - v[2] * Math.sin(angle);
    const z = v[1] * Math.sin(angle) + v[2] * Math.cos(angle);
    return [v[0], y, z];
  }
  function rotateY(v, angle) {
    const x = v[0] * Math.cos(angle) - v[2] * Math.sin(angle);
    const z = v[0] * Math.sin(angle) + v[2] * Math.cos(angle);
    return [x, v[1], z];
  }
  function project(v) {
    const perspective = 800;
    const scale = perspective / (perspective + v[2] * half * 0.5);
    return [v[0] * half * scale, v[1] * half * scale];
  }

  const transformed = verts.map(v => {
    let r = rotateX(v, rx);
    r = rotateY(r, ry);
    return project(r);
  });

  // Faces
  const faceDefs = [
    [0, 1, 2, 3], [4, 5, 6, 7], // back, front
    [0, 1, 5, 4], [2, 3, 7, 6], // bottom, top
    [0, 3, 7, 4], [1, 2, 6, 5]  // left, right
  ];

  const baseC = cubeColor.value;
  ctx.lineWidth = 6;

  faceDefs.forEach((face, fi) => {
    ctx.beginPath();
    ctx.moveTo(transformed[face[0]][0], transformed[face[0]][1]);
    for (let i = 1; i < face.length; i++) {
      ctx.lineTo(transformed[face[i]][0], transformed[face[i]][1]);
    }
    ctx.closePath();
    ctx.strokeStyle = baseC;
    ctx.globalAlpha = fi === (lastLineIndex % 6) ? 0.9 : 0.25;
    ctx.stroke();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = baseC;
    ctx.fill();
  });

  ctx.globalAlpha = 1;

  // Draw active lyric text
  const activeLine = lyricsData[lastLineIndex];
  if (activeLine) {
    ctx.fillStyle = textColor.value;
    ctx.font = `bold ${Math.floor(size * 0.12)}px Tahoma`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = baseC;
    ctx.shadowBlur = 30;
    ctx.fillText(activeLine.text, 0, 0);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}
