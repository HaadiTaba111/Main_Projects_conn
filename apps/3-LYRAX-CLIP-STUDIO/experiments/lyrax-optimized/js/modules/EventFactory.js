// js/modules/EventFactory.js
import { Event, Coordinate } from './Event.js';

export class EventFactory {
  static createAudioEvent(filename, duration) {
    return new Event(
      `aud_${Date.now()}`,
      `صدا: ${filename}`,
      "audio",
      0.0,
      duration || 30.0,
      filename,
      new Coordinate(0, 0, "0%", "0%")
    );
  }

  static createImageEvent(filename, startTime = 0.0, endTime = 5.0, coord = null) {
    return new Event(
      `img_${Date.now()}_${Math.floor(Math.random()*100)}`,
      `تصویر: ${filename}`,
      "image",
      startTime,
      endTime,
      filename,
      coord || new Coordinate("10%", "20%", "80%", "40%")
    );
  }

  static createVideoEvent(filename, startTime = 0.0, endTime = 10.0, coord = null) {
    return new Event(
      `vid_${Date.now()}_${Math.floor(Math.random()*100)}`,
      `ویدیو: ${filename}`,
      "video",
      startTime,
      endTime,
      filename,
      coord || new Coordinate(0, 0, "100%", "100%")
    );
  }

  static createLyricsEvent(text, startTime, endTime, coord = null, style = null) {
    return new Event(
      `lyr_${Date.now()}_${Math.floor(Math.random()*1000)}`,
      `متن: ${text.substring(0, 15)}...`,
      "lyrics",
      startTime,
      endTime,
      text,
      coord || new Coordinate(0, "75%", "100%", "15%"),
      style || {
        font_size: 56,
        color: "#FFF000",
        stroke_color: "#000000",
        stroke_width: 4
      }
    );
  }
}
