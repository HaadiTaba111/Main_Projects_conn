// js/modules/Event.js — Fixed Coordinate constructor bug

export class Coordinate {
  constructor(x = 0, y = 0, width = "100%", height = "100%") {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  toDict() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  static fromDict(d) {
    return new Coordinate(d?.x ?? 0, d?.y ?? 0, d?.width ?? "100%", d?.height ?? "100%");
  }
}

export class Event {
  constructor(id, name, type, startTime = 0.0, endTime = 0.0, content = "", coordinate = null, style = null) {
    this.id = id || `evt_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    this.name = name || "المان جدید";
    this.type = type || "text";
    this.startTime = parseFloat(startTime) || 0.0;
    this.endTime = parseFloat(endTime) || 0.0;
    this.content = content || "";
    this.coordinate = coordinate || new Coordinate();
    this.style = style || {
      font_size: 56,
      color: "#FFF000",
      stroke_color: "#000000",
      stroke_width: 4
    };
    this.animationStyle = "karaoke_glow";
  }

  toDict() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      start_time: this.startTime,
      end_time: this.endTime,
      content: this.content,
      coordinate: this.coordinate instanceof Coordinate ? this.coordinate.toDict() : this.coordinate,
      style: this.style,
      animationStyle: this.animationStyle
    };
  }

  static fromDict(d) {
    const evt = new Event(
      d.id, d.name, d.type,
      d.start_time, d.end_time,
      d.content,
      Coordinate.fromDict(d.coordinate),
      d.style
    );
    evt.animationStyle = d.animationStyle || "karaoke_glow";
    return evt;
  }
}
