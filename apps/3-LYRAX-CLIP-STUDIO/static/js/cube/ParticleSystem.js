// js/cube/ParticleSystem.js — ذرات پس‌زمینه + حلقه‌های اکولایزر مکعب لیریکس
//
// برگرفته از بسته‌ی «لیراکس / lyrax-3d-cube» و مقاوم‌شده برای محیط استودیو:
// اگر canvas نباشد یا مرورگر از requestAnimationFrame پشتیبانی نکند، بی‌صدا خاموش می‌شود.

const PARTICLE_COLORS = ["255, 100, 160", "120, 200, 255", "255, 240, 0"];

export class ParticleSystem {
  constructor(canvasId, options = {}) {
    this.canvas = typeof canvasId === "string" ? document.getElementById(canvasId) : canvasId;
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.destroyed = false;
    this.particles = [];
    this._loop = this._loop.bind(this);
    if (!this.ctx) return;

    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
    this._initParticles();
    this._schedule();
    void options;
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = this.canvas.offsetWidth || this.canvas.width || 320;
    this.canvas.height = this.canvas.offsetHeight || this.canvas.height || 320;
  }

  _initParticles() {
    if (!this.canvas) return;
    const count = Math.max(12, Math.min(160, Math.floor((this.canvas.width * this.canvas.height) / 12000)));
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        r: Math.random() * 2 + 0.5,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.5 + 0.2,
        pulse: Math.random() * Math.PI * 2,
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length]
      });
    }
  }

  _schedule() {
    if (typeof requestAnimationFrame !== "function") return;
    requestAnimationFrame(this._loop);
  }

  _loop() {
    if (this.destroyed || !this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.pulse += 0.02;

      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;

      const alpha = p.alpha * (0.7 + 0.3 * Math.sin(p.pulse));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color}, ${alpha})`;
      ctx.fill();
    }
    this._schedule();
  }

  setColor(rgb) {
    if (!rgb) return;
    this.particles.forEach((p) => { p.color = rgb; });
  }

  destroy() {
    this.destroyed = true;
    if (this._onResize) window.removeEventListener("resize", this._onResize);
    this.particles = [];
  }
}

export class VisualizerRings {
  constructor(canvasId, audioAnalyser = null) {
    this.canvas = typeof canvasId === "string" ? document.getElementById(canvasId) : canvasId;
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.analyser = audioAnalyser;
    this.dataArray = audioAnalyser ? new Uint8Array(audioAnalyser.frequencyBinCount) : null;
    this.destroyed = false;
    this._loop = this._loop.bind(this);
    if (!this.ctx) return;

    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
    this._schedule();
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = this.canvas.offsetWidth || this.canvas.width || 320;
    this.canvas.height = this.canvas.offsetHeight || this.canvas.height || 320;
  }

  setAnalyser(analyser) {
    this.analyser = analyser;
    this.dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
  }

  _schedule() {
    if (typeof requestAnimationFrame !== "function") return;
    requestAnimationFrame(this._loop);
  }

  _loop() {
    if (this.destroyed || !this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    let avg = 0;
    if (this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray);
      let sum = 0;
      const count = Math.min(this.dataArray.length, 64);
      for (let i = 0; i < count; i++) sum += this.dataArray[i];
      avg = sum / count;
    }

    const cx = w / 2;
    const cy = h / 2;
    const baseRadius = Math.min(w, h) * 0.22 + avg * 0.8;

    for (let i = 3; i >= 0; i--) {
      const radius = baseRadius + i * 50 + Math.sin(Date.now() * 0.002 + i) * 10;
      const alpha = 0.08 + (avg / 255) * 0.15;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 77, 141, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    this._schedule();
  }

  destroy() {
    this.destroyed = true;
    if (this._onResize) window.removeEventListener("resize", this._onResize);
  }
}

export default ParticleSystem;
