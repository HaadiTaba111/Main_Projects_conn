// videoExporter.js — Export 3D cube animation to WebM using Canvas captureStream

export class VideoExporter {
  constructor(exportCanvas, fps = 30) {
    this.canvas = exportCanvas;
    this.fps = fps;
    this.recorder = null;
    this.chunks = [];
    this.isRecording = false;
  }

  start(filename = "lyrax-cube-export.webm") {
    if (this.isRecording) return;
    const stream = this.canvas.captureStream(this.fps);
    this.recorder = new MediaRecorder(stream, {
      mimeType: "video/webm; codecs=vp9",
      videoBitsPerSecond: 8000000
    });
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };
    this.recorder.start();
    this.isRecording = true;
  }

  stop() {
    if (!this.isRecording || !this.recorder) return;
    this.recorder.stop();
    this.isRecording = false;
  }
}
