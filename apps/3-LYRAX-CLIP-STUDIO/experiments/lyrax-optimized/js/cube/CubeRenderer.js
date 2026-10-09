// js/cube/CubeRenderer.js — 3D Cube lyrics renderer

const FACES = ["front", "back", "right", "left", "top", "bottom"];

export class CubeRenderer {
  constructor(cubeEl) {
    this.cube = cubeEl;
    this.faceEls = {};
    this.textEls = {};
    FACES.forEach(f => {
      this.faceEls[f] = cubeEl.querySelector(`.face-${f}`);
      this.textEls[f] = this.faceEls[f]?.querySelector(".cube-text");
    });
    this.currentLine = 0;
    this.lines = [];
    this.rotation = { x: -15, y: 25, z: 0 };
    this.targetRotation = { x: -15, y: 25, z: 0 };
    this._startAnimationLoop();
  }

  setLines(lines) {
    this.lines = lines;
    this.currentLine = 0;
    FACES.forEach((f, i) => {
      const line = lines[i] || { text: "" };
      if (this.textEls[f]) this.textEls[f].textContent = line.text || "";
    });
    this._highlightActiveFace();
  }

  nextLine() {
    if (this.lines.length === 0) return;
    this.currentLine = (this.currentLine + 1) % this.lines.length;
    this._rotateToLine(this.currentLine);
  }

  jumpToLine(index) {
    if (this.lines.length === 0) return;
    this.currentLine = Math.max(0, Math.min(index, this.lines.length - 1));
    this._rotateToLine(this.currentLine);
  }

  _rotateToLine(lineIndex) {
    // Deterministic but varied rotation using golden angle distribution
    const seed = lineIndex * 137.5;
    const rx = ((seed % 360) - 180) * 0.6;
    const ry = (((seed * 1.618) % 360) - 180) * 0.6;
    const rz = (((seed * 2.718) % 180) - 90) * 0.3;
    this.targetRotation = { x: rx, y: ry, z: rz };

    // Pre-load next 6 lines onto faces
    const nextLines = [];
    for (let i = 0; i < FACES.length; i++) {
      const li = (lineIndex + i) % this.lines.length;
      nextLines.push(this.lines[li]?.text || "");
    }
    FACES.forEach((f, i) => {
      if (this.textEls[f]) this.textEls[f].textContent = nextLines[i];
    });
    this._highlightActiveFace();
  }

  _highlightActiveFace() {
    FACES.forEach(f => this.faceEls[f]?.classList.remove("active"));
    const activeFace = FACES[this.currentLine % FACES.length];
    this.faceEls[activeFace]?.classList.add("active");
  }

  _startAnimationLoop() {
    const animate = () => {
      const ease = 0.08;
      this.rotation.x += (this.targetRotation.x - this.rotation.x) * ease;
      this.rotation.y += (this.targetRotation.y - this.rotation.y) * ease;
      this.rotation.z += ((this.targetRotation.z || 0) - this.rotation.z) * ease;

      const time = Date.now() * 0.001;
      const floatX = Math.sin(time * 0.5) * 3;
      const floatY = Math.cos(time * 0.4) * 3;

      const rx = this.rotation.x + floatX;
      const ry = this.rotation.y + floatY;
      const rz = this.rotation.z || 0;

      this.cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }
}
