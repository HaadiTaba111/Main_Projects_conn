// cubeRenderer.js — 3D Cube lyrics renderer

const faces = ["front", "back", "right", "left", "top", "bottom"];

export class CubeRenderer {
  constructor(cubeEl, options = {}) {
    this.cube = cubeEl;
    this.faceEls = {};
    faces.forEach(f => this.faceEls[f] = cubeEl.querySelector(`.face-${f}`));
    this.textEls = {};
    faces.forEach(f => this.textEls[f] = this.faceEls[f].querySelector(".lyric-text"));

    this.currentLine = 0;
    this.lines = [];
    this.rotation = { x: -15, y: 25 };
    this.targetRotation = { x: -15, y: 25 };
    this.autoRotate = true;
    this.autoRotateSpeed = options.speed || 0.3;
    this.cubeSize = options.size || 380;
    this.baseColor = options.color || "#ff0055";
    this.textColor = options.textColor || "#ffffff";

    this._applySize();
    this._applyColors();
    this._startAnimationLoop();
  }

  setLines(lines) {
    this.lines = lines;
    this.currentLine = 0;
    // Fill faces cyclically
    faces.forEach((f, i) => {
      const line = lines[i] || { text: "" };
      this.textEls[f].textContent = line.text || "";
    });
    this._highlightActiveFace();
  }

  setCubeSize(px) {
    this.cubeSize = px;
    this._applySize();
  }

  setColors(cubeColor, textColor) {
    this.baseColor = cubeColor;
    this.textColor = textColor;
    this._applyColors();
  }

  _applySize() {
    const half = this.cubeSize / 2;
    this.cube.style.width = `${this.cubeSize}px`;
    this.cube.style.height = `${this.cubeSize}px`;
    faces.forEach(f => {
      this.faceEls[f].style.width = `${this.cubeSize}px`;
      this.faceEls[f].style.height = `${this.cubeSize}px`;
    });
    // Re-apply transforms with new half-size
    this.faceEls["front"].style.transform  = `rotateY(0deg) translateZ(${half}px)`;
    this.faceEls["back"].style.transform   = `rotateY(180deg) translateZ(${half}px)`;
    this.faceEls["right"].style.transform  = `rotateY(90deg) translateZ(${half}px)`;
    this.faceEls["left"].style.transform   = `rotateY(-90deg) translateZ(${half}px)`;
    this.faceEls["top"].style.transform    = `rotateX(90deg) translateZ(${half}px)`;
    this.faceEls["bottom"].style.transform = `rotateX(-90deg) translateZ(${half}px)`;
  }

  _applyColors() {
    const r = parseInt(this.baseColor.slice(1, 3), 16);
    const g = parseInt(this.baseColor.slice(3, 5), 16);
    const b = parseInt(this.baseColor.slice(5, 7), 16);
    faces.forEach(f => {
      const el = this.faceEls[f];
      el.style.borderColor = `rgba(${r},${g},${b},0.5)`;
      el.style.background = `rgba(${r},${g},${b},0.12)`;
      el.style.boxShadow = `0 0 40px rgba(${r},${g},${b},0.15), inset 0 0 60px rgba(${r},${g},${b},0.05)`;
      el.style.color = this.textColor;
    });
  }

  /**
   * Advance to next line with a 3D rotation transition.
   * Each line gets a unique rotation pattern so every transition looks different.
   */
  nextLine() {
    if (this.lines.length === 0) return;
    const prevLine = this.currentLine;
    this.currentLine = (this.currentLine + 1) % this.lines.length;

    // Deterministic but varied rotation based on line index
    const seed = this.currentLine * 137.5; // golden angle for distribution
    const rx = ((seed % 360) - 180) * 0.6;
    const ry = (((seed * 1.618) % 360) - 180) * 0.6;
    const rz = (((seed * 2.718) % 180) - 90) * 0.3;

    this.targetRotation = { x: rx, y: ry, z: rz };

    // Update the face that will be "back" after rotation (pre-load next lines)
    const faceIndex = this.currentLine % faces.length;
    const nextLines = [];
    for (let i = 0; i < faces.length; i++) {
      const lineIdx = (this.currentLine + i) % this.lines.length;
      nextLines.push(this.lines[lineIdx]?.text || "");
    }
    faces.forEach((f, i) => {
      this.textEls[f].textContent = nextLines[i];
    });

    this._highlightActiveFace();
  }

  jumpToLine(index) {
    if (this.lines.length === 0) return;
    this.currentLine = Math.max(0, Math.min(index, this.lines.length - 1));
    const seed = this.currentLine * 137.5;
    this.targetRotation = {
      x: ((seed % 360) - 180) * 0.6,
      y: (((seed * 1.618) % 360) - 180) * 0.6,
      z: (((seed * 2.718) % 180) - 90) * 0.3
    };
    const nextLines = [];
    for (let i = 0; i < faces.length; i++) {
      const lineIdx = (this.currentLine + i) % this.lines.length;
      nextLines.push(this.lines[lineIdx]?.text || "");
    }
    faces.forEach((f, i) => {
      this.textEls[f].textContent = nextLines[i];
    });
    this._highlightActiveFace();
  }

  _highlightActiveFace() {
    faces.forEach(f => this.faceEls[f].classList.remove("active"));
    const activeFace = faces[this.currentLine % faces.length];
    this.faceEls[activeFace].classList.add("active");
  }

  _startAnimationLoop() {
    const animate = () => {
      // Smooth interpolation toward target
      const ease = 0.08;
      this.rotation.x += (this.targetRotation.x - this.rotation.x) * ease;
      this.rotation.y += (this.targetRotation.y - this.rotation.y) * ease;
      this.rotation.z = (this.targetRotation.z || 0);

      // Add subtle idle float
      const time = Date.now() * 0.001;
      const floatX = Math.sin(time * 0.5) * 3;
      const floatY = Math.cos(time * 0.4) * 3;

      if (this.autoRotate && this.lines.length === 0) {
        this.rotation.y += this.autoRotateSpeed;
      }

      const rx = this.rotation.x + floatX;
      const ry = this.rotation.y + floatY;
      const rz = this.rotation.z || 0;

      this.cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }
}
