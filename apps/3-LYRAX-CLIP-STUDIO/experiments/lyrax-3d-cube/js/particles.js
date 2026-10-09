// particles.js — Background particle system + audio rings

export class ParticleSystem {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.particles = [];
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this._initParticles();
    this._animate();
  }

  resize() {
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }

  _initParticles() {
    const count = Math.floor((this.canvas.width * this.canvas.height) / 12000);
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        r: Math.random() * 2 + 0.5,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.5 + 0.2,
        pulse: Math.random() * Math.PI * 2
      });
    }
  }

  _animate() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const time = Date.now() * 0.001;

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
      ctx.fillStyle = `rgba(255, 100, 160, ${alpha})`;
      ctx.fill();
    }

    requestAnimationFrame(() => this._animate());
  }
}

export class VisualizerRings {
  constructor(canvasId, audioAnalyser) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.analyser = audioAnalyser;
    this.dataArray = null;
    if (analyser) {
      this.dataArray = new Uint8Array(analyser.frequencyBinCount);
    }
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this._animate();
  }

  resize() {
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }

  _animate() {
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
    const baseRadius = 180 + avg * 0.8;

    // Draw concentric rings that pulse with audio
    for (let i = 3; i >= 0; i--) {
      const radius = baseRadius + i * 50 + Math.sin(Date.now() * 0.002 + i) * 10;
      const alpha = 0.08 + (avg / 255) * 0.15;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 77, 141, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    requestAnimationFrame(() => this._animate());
  }

  setAnalyser(analyser) {
    this.analyser = analyser;
    if (analyser) {
      this.dataArray = new Uint8Array(analyser.frequencyBinCount);
    }
  }
}
