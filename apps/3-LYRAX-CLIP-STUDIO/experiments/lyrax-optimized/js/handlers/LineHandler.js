// js/handlers/LineHandler.js — با پشتیبانی از مکعب ۳بعدی
import { EventFactory } from '../modules/EventFactory.js';

export class LineHandler {
  constructor(project, onSyncUpdateCallback, cubeRenderer = null) {
    this.project = project;
    this.onSyncUpdateCallback = onSyncUpdateCallback || (() => {});
    this.cubeRenderer = cubeRenderer;
    this.rawLines = [];
    this.currentIndex = -1;
    this.activeEventId = null;
    this.lineToEventMap = new Map();
    this.lyricAnimationStyle = "cube_3d";
  }

  setRawLyrics(text) {
    this.rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    this.currentIndex = -1;
    this.activeEventId = null;
    this.lineToEventMap.clear();
    // Update cube with all lines
    if (this.cubeRenderer) {
      this.cubeRenderer.setLines(this.rawLines.map((t, i) => ({ text: t, id: i })));
    }
    this.onSyncUpdateCallback(this);
  }

  setAnimationStyle(style) {
    this.lyricAnimationStyle = style || "cube_3d";
    if (this.project) this.project.lyricAnimationStyle = this.lyricAnimationStyle;
    this.onSyncUpdateCallback(this);
  }

  nextLine(currentTime) {
    if (this.rawLines.length === 0) return;

    // Close current event
    if (this.currentIndex >= 0) {
      const currentEventId = this.lineToEventMap.get(this.currentIndex) || this.activeEventId;
      if (currentEventId) {
        const currentEvt = this.project.timeline.getEvent(currentEventId);
        if (currentEvt) currentEvt.endTime = currentTime;
      }
    }

    this.currentIndex++;
    if (this.currentIndex >= this.rawLines.length) {
      this.currentIndex = this.rawLines.length - 1;
      this.activeEventId = null;
      this.project.timeline.notifyChange();
      this.onSyncUpdateCallback(this);
      return;
    }

    const nextText = this.rawLines[this.currentIndex];
    const defaultDuration = this.project.defaultLyricDuration || 4.0;
    const defaultEnd = Math.min(currentTime + defaultDuration, this.project.timeline.duration || (currentTime + defaultDuration));

    const newEvt = EventFactory.createLyricsEvent(nextText, currentTime, defaultEnd);
    newEvt.animationStyle = this.lyricAnimationStyle;

    this.activeEventId = newEvt.id;
    this.lineToEventMap.set(this.currentIndex, newEvt.id);
    this.project.timeline.addEvent(newEvt);

    // Trigger cube rotation
    if (this.cubeRenderer && this.lyricAnimationStyle === "cube_3d") {
      this.cubeRenderer.jumpToLine(this.currentIndex);
    }

    this.onSyncUpdateCallback(this);
  }

  prevLine(currentTime) {
    if (this.rawLines.length === 0 || this.currentIndex < 0) return;

    const currentEventId = this.lineToEventMap.get(this.currentIndex) || this.activeEventId;
    if (currentEventId) {
      this.project.timeline.removeEvent(currentEventId);
      this.lineToEventMap.delete(this.currentIndex);
    }

    this.currentIndex--;

    if (this.currentIndex >= 0) {
      const prevEventId = this.lineToEventMap.get(this.currentIndex);
      if (prevEventId) {
        const existingEvt = this.project.timeline.getEvent(prevEventId);
        if (existingEvt) {
          this.activeEventId = existingEvt.id;
          const defaultDuration = this.project.defaultLyricDuration || 4.0;
          existingEvt.endTime = Math.max(existingEvt.startTime + defaultDuration, (currentTime || existingEvt.startTime + defaultDuration));
        }
      } else {
        this.activeEventId = null;
      }
    } else {
      this.activeEventId = null;
    }

    // Rotate cube back
    if (this.cubeRenderer && this.lyricAnimationStyle === "cube_3d" && this.currentIndex >= 0) {
      this.cubeRenderer.jumpToLine(this.currentIndex);
    }

    this.project.timeline.notifyChange();
    this.onSyncUpdateCallback(this);
  }

  getCurrentLineText() {
    if (this.currentIndex >= 0 && this.currentIndex < this.rawLines.length) {
      return `[خ ${this.currentIndex + 1}/${this.rawLines.length}]: ${this.rawLines[this.currentIndex]}`;
    }
    return "آماده همگام‌سازی (روی دکمه خط بعدی کلیک کنید)";
  }
}
