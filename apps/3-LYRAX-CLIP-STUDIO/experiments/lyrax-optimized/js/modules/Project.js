// js/modules/Project.js
import { Timeline } from './Timeline.js';
import { Event } from './Event.js';

export class Project {
  constructor(name = "default_project") {
    this.name = name;
    this.resolution = [1080, 1920];
    this.fps = 30;
    this.background = "#000000";
    this.defaultLyricDuration = 4.0;
    this.timeline = new Timeline();
    this.lyricAnimationStyle = "cube_3d";
  }

  toDict() {
    return {
      name: this.name,
      resolution: this.resolution,
      fps: this.fps,
      background: this.background,
      defaultLyricDuration: this.defaultLyricDuration,
      lyricAnimationStyle: this.lyricAnimationStyle,
      duration: this.timeline.duration,
      events: this.timeline.events.map(e => e.toDict())
    };
  }

  loadFromDict(d) {
    this.name = d.name || "default_project";
    this.resolution = d.resolution || [1080, 1920];
    this.fps = d.fps || 30;
    this.background = d.background || "#000000";
    this.defaultLyricDuration = d.defaultLyricDuration || 4.0;
    this.lyricAnimationStyle = d.lyricAnimationStyle || "cube_3d";

    this.timeline.events = [];
    const evts = d.events || [];
    for (const ed of evts) {
      try { this.timeline.events.push(Event.fromDict(ed)); }
      catch (e) { console.warn('Failed to load event:', ed, e); }
    }
    this.timeline.recalculateDuration();
    this.timeline.notifyChange();
  }
}
