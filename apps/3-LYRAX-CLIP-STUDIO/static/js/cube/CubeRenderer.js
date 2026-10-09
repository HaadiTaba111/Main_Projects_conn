// js/cube/CubeRenderer.js — مکعب سه‌بعدی زنده‌ی لیریکس (LyraX Cube)
//
// این ماژول همان مکعب سه‌بعدی بسته‌ی «لیراکس / lyrax-3d-cube» است که داخل خودِ
// استودیو (پیش‌نمایش زنده + استودیوی مستقل مکعب) استفاده می‌شود. هر خط لیریکس روی
// یکی از ۶ وجه مکعب می‌نشیند و با هر تغییر خط، مکعب با چرخش سه‌بعدی به خط بعدی
// می‌چرخد. زاویه‌ی چرخش هر خط «قطعی و تکرارپذیر» است (golden angle) تا خروجی
// مرورگر با خروجی FFmpeg یکسان بماند.
//
// سازگاری: هم با markup نسخه‌ی بهینه‌شده (span.cube-text) و هم با markup نسخه‌ی
// مستقل (span.lyric-text) کار می‌کند و اگر مکعب در صفحه نباشد، بدون خطا خاموش می‌ماند.

const FACES = ["front", "back", "right", "left", "top", "bottom"];
const TEXT_SELECTOR = ".cube-text, .lyric-text";
const DEFAULT_SIZE = 300;

export class CubeRenderer {
  /**
   * @param {HTMLElement|null} cubeEl عنصر .cube
   * @param {{size?:number, color?:string, textColor?:string, speed?:number}} [options]
   */
  constructor(cubeEl, options = {}) {
    this.cube = cubeEl || null;
    this.enabled = Boolean(this.cube);
    this.faceEls = {};
    this.textEls = {};
    // 'bottom_up' = مکعب با هر خط ۹۰ درجه رو به بالا می‌چرخد (خط بعد از پایین می‌آید)
    this.rotationMode = options.rotationMode === 'free' ? 'free' : 'bottom_up';
    // فقط وجه خط جاری متن دارد؛ بقیه‌ی وجه‌ها خالی می‌مانند (همان «فقط صفحه‌ی خط لیریکس»)
    this.singleFace = options.singleFace !== false;
    this.highlightColor = options.highlightColor || '#FFF000';

    if (this.enabled) {
      FACES.forEach((face) => {
        this.faceEls[face] = this.cube.querySelector(`.face-${face}`);
        this.textEls[face] = this.faceEls[face]?.querySelector(TEXT_SELECTOR) || null;
      });
    }

    this.lines = [];
    this.currentLine = 0;
    this.cubeSize = Number(options.size) > 0 ? Number(options.size) : DEFAULT_SIZE;
    this.baseColor = options.color || "#ff0055";
    this.textColor = options.textColor || "#ffffff";
    this.autoRotate = true;
    this.autoRotateSpeed = Number(options.speed) > 0 ? Number(options.speed) : 0.25;
    this.rotation = { x: this.rotationMode === 'bottom_up' ? 0 : -15, y: 16, z: 0 };
    this.targetRotation = { x: this.rotation.x, y: this.rotation.y, z: 0 };

    if (this.enabled) {
      this.setCubeSize(this.cubeSize);
      this.setColors(this.baseColor, this.textColor);
      this._startAnimationLoop();
    }
  }

  /** خطوط را می‌پذیرد: هم رشته‌ی ساده و هم آرایه‌ای از {text} یا {txt}. */
  setLines(lines) {
    if (!this.enabled) return;
    this.lines = (Array.isArray(lines) ? lines : []).map((line) => {
      if (typeof line === "string") return { text: line };
      return { text: line?.text ?? line?.txt ?? "" };
    });
    this.currentLine = 0;
    this._paintFaces();
  }

  getLines() {
    return this.lines.map((line) => line.text);
  }

  /** رفتن به خط بعدی با چرخش سه‌بعدی (seed قطعی بر اساس شماره خط). */
  nextLine() {
    if (!this.enabled || this.lines.length === 0) return;
    this.currentLine = (this.currentLine + 1) % this.lines.length;
    this._aimAtCurrentLine();
  }

  /** پرش مستقیم به یک خط مشخص (برای سینک با پخش آهنگ). */
  jumpToLine(index) {
    if (!this.enabled || this.lines.length === 0) return;
    const numeric = Number(index);
    if (!Number.isFinite(numeric)) return;
    this.currentLine = Math.max(0, Math.min(Math.trunc(numeric), this.lines.length - 1));
    this._aimAtCurrentLine();
  }

  /** فعال/غیرفعال کردن چرخش خودکار (وقتی هیچ خطی برای نمایش نیست). */
  setAutoRotate(enabled) {
    this.autoRotate = Boolean(enabled);
  }

  setSpeed(speed) {
    const value = Number(speed);
    if (Number.isFinite(value) && value > 0) this.autoRotateSpeed = value;
  }

  setCubeSize(px) {
    if (!this.enabled) return;
    const size = Number(px);
    if (!Number.isFinite(size) || size <= 0) return;
    this.cubeSize = size;
    this._applySize();
  }

  setColors(cubeColor, textColor) {
    if (cubeColor) this.baseColor = cubeColor;
    if (textColor) this.textColor = textColor;
    if (!this.enabled) return;
    this._applyColors();
  }

  /** وضعیت فعلی برای تست/دیباگ (بدون وابستگی به DOM). */
  getState() {
    return {
      enabled: this.enabled,
      currentLine: this.currentLine,
      totalLines: this.lines.length,
      rotation: { ...this.rotation },
      targetRotation: { ...this.targetRotation },
      rotationMode: this.rotationMode,
      singleFace: this.singleFace,
      visibleFace: this.visibleFaceAt(),
      size: this.cubeSize,
      color: this.baseColor,
      textColor: this.textColor
    };
  }

  destroy() {
    this._destroyed = true;
    this.enabled = false;
    this.lines = [];
  }

  // ===== داخلی =====

  _aimAtCurrentLine() {
    if (this.rotationMode === 'bottom_up') {
      // هر خط ۹۰ درجه حول محور X؛ زاویه انباشته می‌شود تا چرخش همیشه رو به بالا بماند.
      this.targetRotation = { x: this.currentLine * 90, y: 16, z: 0 };
    } else {
      // توزیع زاویه‌ها با نسبت طلایی؛ هم متنوع، هم تکرارپذیر بین مرورگر و رندر.
      const seed = this.currentLine * 137.5;
      this.targetRotation = {
        x: ((seed % 360) - 180) * 0.6,
        y: (((seed * 1.618) % 360) - 180) * 0.6,
        z: (((seed * 2.718) % 180) - 90) * 0.3
      };
    }
    this._paintFaces();
  }

  /** وجهی که در زاویه‌ی داده‌شده رو به بیننده است (بیشترین مؤلفه‌ی z). */
  visibleFaceAt(rotation = this.targetRotation) {
    const rad = (deg) => (Number(deg) || 0) * Math.PI / 180;
    const rx = rad(rotation.x), ry = rad(rotation.y), rz = rad(rotation.z);
    const normals = {
      front: [0, 0, 1], back: [0, 0, -1], right: [1, 0, 0],
      left: [-1, 0, 0], top: [0, -1, 0], bottom: [0, 1, 0]
    };
    const rotate = (v) => {
      let [x, y, z] = v;
      // Rotate about Z, then Y, then X — همان ترتیب transform مکعب.
      let x1 = x * Math.cos(rz) - y * Math.sin(rz);
      let y1 = x * Math.sin(rz) + y * Math.cos(rz);
      let x2 = x1 * Math.cos(ry) + z * Math.sin(ry);
      let z2 = -x1 * Math.sin(ry) + z * Math.cos(ry);
      let y3 = y1 * Math.cos(rx) - z2 * Math.sin(rx);
      let z3 = y1 * Math.sin(rx) + z2 * Math.cos(rx);
      return [x2, y3, z3];
    };
    let best = { face: 'front', z: -Infinity };
    FACES.forEach((face) => {
      const z = rotate(normals[face])[2];
      if (z > best.z) best = { face, z };
    });
    return best.face;
  }

  setRotationMode(mode, { repaint = true } = {}) {
    this.rotationMode = mode === 'free' ? 'free' : 'bottom_up';
    if (repaint) this._aimAtCurrentLine();
  }

  /** متن یک وجه با پشتیبانی از کلمه‌ی *ویژه* (زرد/درشت). */
  _faceHtml(text) {
    const safe = String(text ?? '');
    if (!/\*[^*]+\*/.test(safe)) return null;
    const escaped = safe
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*([^*]+)\*/g, '<em class="lyra-hl">$1</em>');
    return escaped;
  }

  _paintFaces() {
    if (!this.enabled) return;

    if (this.lines.length === 0) {
      FACES.forEach((face) => {
        const textEl = this.textEls[face];
        if (textEl) textEl.textContent = "";
      });
      this._highlightActiveFace(null);
      return;
    }

    const activeFace = this.visibleFaceAt();
    FACES.forEach((face, i) => {
      const textEl = this.textEls[face];
      if (!textEl) return;
      // در حالت تک‌وجهی فقط وجه روبه‌رو متن دارد؛ بقیه خالی می‌مانند.
      const shouldHaveText = this.singleFace ? (face === activeFace) : true;
      if (!shouldHaveText) {
        textEl.textContent = "";
        return;
      }
      const lineIndex = this.singleFace
        ? this.currentLine
        : (this.currentLine + i) % this.lines.length;
      const text = this.lines[lineIndex]?.text || "";
      const html = this._faceHtml(text);
      if (html === null) textEl.textContent = text;
      else textEl.innerHTML = html;
    });
    this._highlightActiveFace(activeFace);
  }

  _highlightActiveFace(activeFace = null) {
    if (!this.enabled) return;
    FACES.forEach((face) => this.faceEls[face]?.classList.remove("active"));
    if (this.lines.length === 0) return;
    const face = activeFace || this.visibleFaceAt();
    this.faceEls[face]?.classList.add("active");
    this.activeFace = face;
  }

  _applySize() {
    const half = this.cubeSize / 2;
    this.cube.style.width = `${this.cubeSize}px`;
    this.cube.style.height = `${this.cubeSize}px`;
    FACES.forEach((face) => {
      const el = this.faceEls[face];
      if (!el) return;
      el.style.width = `${this.cubeSize}px`;
      el.style.height = `${this.cubeSize}px`;
    });
    const transforms = {
      front: `rotateY(0deg) translateZ(${half}px)`,
      back: `rotateY(180deg) translateZ(${half}px)`,
      right: `rotateY(90deg) translateZ(${half}px)`,
      left: `rotateY(-90deg) translateZ(${half}px)`,
      top: `rotateX(90deg) translateZ(${half}px)`,
      bottom: `rotateX(-90deg) translateZ(${half}px)`
    };
    FACES.forEach((face) => {
      if (this.faceEls[face]) this.faceEls[face].style.transform = transforms[face];
    });
  }

  _applyColors() {
    const hex = /^#[0-9a-fA-F]{6}$/.test(this.baseColor) ? this.baseColor : "#ff0055";
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    FACES.forEach((face) => {
      const el = this.faceEls[face];
      if (!el) return;
      el.style.borderColor = `rgba(${r},${g},${b},0.5)`;
      el.style.background = `rgba(${r},${g},${b},0.12)`;
      el.style.boxShadow = `0 0 40px rgba(${r},${g},${b},0.15), inset 0 0 60px rgba(${r},${g},${b},0.05)`;
      el.style.color = this.textColor;
    });
  }

  _startAnimationLoop() {
    const supportsRaf = typeof requestAnimationFrame === "function";
    const animate = () => {
      if (this._destroyed) return;
      const ease = 0.08;
      this.rotation.x += (this.targetRotation.x - this.rotation.x) * ease;
      this.rotation.y += (this.targetRotation.y - this.rotation.y) * ease;
      this.rotation.z += ((this.targetRotation.z || 0) - this.rotation.z) * ease;

      const time = Date.now() * 0.001;
      const floatX = Math.sin(time * 0.5) * 3;
      const floatY = Math.cos(time * 0.4) * 3;

      if (this.autoRotate && this.lines.length === 0 && this.rotationMode !== 'bottom_up') {
        this.rotation.y += this.autoRotateSpeed;
      }

      if (this.enabled) {
        const rx = this.rotation.x + floatX;
        const ry = this.rotation.y + floatY;
        const rz = this.rotation.z || 0;
        this.cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
      }

      if (supportsRaf) requestAnimationFrame(animate);
    };

    if (supportsRaf) requestAnimationFrame(animate);
    else {
      // محیط‌های بدون requestAnimationFrame (مثل تست‌های Node): یک فریم ساده.
      this.cube.style.transform = `rotateX(${this.rotation.x}deg) rotateY(${this.rotation.y}deg) rotateZ(${this.rotation.z}deg)`;
    }
  }
}

export default CubeRenderer;
