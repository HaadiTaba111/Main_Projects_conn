// js/ui/EventListUI.js
import { Event } from '../modules/Event.js';

export class EventListUI {
  constructor(project) {
    this.project = project;
    this.tbody = document.getElementById('eventsTableBody');
    this.addBtn = document.getElementById('btnAddEvent');
    this.setupEvents();
  }

  setupEvents() {
    this.addBtn.addEventListener('click', () => {
      const newEvt = new Event(null, "المان سفارشی", "text", 0, 5, "متن تستی", { x: "10%", y: "40%", width: "80%", height: "20%" });
      this.project.timeline.addEvent(newEvt);
    });
  }

  render() {
    this.tbody.innerHTML = "";
    const events = this.project.timeline.events;
    if (events.length === 0) {
      this.tbody.innerHTML = `<tr><td colspan="10" style="color:var(--text-muted)">هیچ المانی در تایم‌لاین وجود ندارد</td></tr>`;
      return;
    }
    for (const evt of events) {
      const tr = document.createElement('tr');
      tr.dataset.id = evt.id;
      const coord = evt.coordinate || { x: 0, y: 0, width: "100%", height: "100%" };
      tr.innerHTML = `
        <td>
          <select class="evt-type" style="background:var(--bg-input);color:#fff;border:1px solid var(--border-color);padding:2px 4px;border-radius:4px;">
            <option value="audio" ${evt.type==='audio'?'selected':''}>صدا</option>
            <option value="video" ${evt.type==='video'?'selected':''}>ویدیو</option>
            <option value="image" ${evt.type==='image'?'selected':''}>تصویر</option>
            <option value="lyrics" ${evt.type==='lyrics'?'selected':''}>لیریکس</option>
            <option value="text" ${evt.type==='text'?'selected':''}>متن</option>
          </select>
        </td>
        <td><input type="text" class="evt-name" value="${evt.name}" style="width:100px;background:var(--bg-input);color:#fff;border:1px solid var(--border-color);padding:4px;border-radius:4px;"></td>
        <td><input type="text" class="evt-content" value="${evt.content}" style="width:120px;background:var(--bg-input);color:#fff;border:1px solid var(--border-color);padding:4px;border-radius:4px;"></td>
        <td><input type="number" class="evt-start" step="0.1" value="${evt.startTime.toFixed(1)}" style="width:60px;background:var(--bg-input);color:#fff;border:1px solid var(--border-color);padding:4px;border-radius:4px;"></td>
        <td><input type="number" class="evt-end" step="0.1" value="${evt.endTime.toFixed(1)}" style="width:60px;background:var(--bg-input);color:#fff;border:1px solid var(--border-color);padding:4px;border-radius:4px;"></td>
        <td><input type="text" class="evt-x" value="${coord.x}" style="width:50px;background:var(--bg-input);color:#fff;border:1px solid var(--border-color);padding:4px;border-radius:4px;"></td>
        <td><input type="text" class="evt-y" value="${coord.y}" style="width:50px;background:var(--bg-input);color:#fff;border:1px solid var(--border-color);padding:4px;border-radius:4px;"></td>
        <td><input type="text" class="evt-w" value="${coord.width}" style="width:50px;background:var(--bg-input);color:#fff;border:1px solid var(--border-color);padding:4px;border-radius:4px;"></td>
        <td><input type="text" class="evt-h" value="${coord.height}" style="width:50px;background:var(--bg-input);color:#fff;border:1px solid var(--border-color);padding:4px;border-radius:4px;"></td>
        <td><button class="btn btn-danger btn-delete" style="padding:4px 8px;font-size:0.8rem;">🗑️</button></td>
      `;

      const bindUpdate = (selector, updater) => {
        const elem = tr.querySelector(selector);
        if (elem) elem.addEventListener('change', () => { updater(elem.value); this.project.timeline.notifyChange(); });
      };
      bindUpdate('.evt-type', val => evt.type = val);
      bindUpdate('.evt-name', val => evt.name = val);
      bindUpdate('.evt-content', val => evt.content = val);
      bindUpdate('.evt-start', val => evt.startTime = parseFloat(val) || 0);
      bindUpdate('.evt-end', val => evt.endTime = parseFloat(val) || 0);
      bindUpdate('.evt-x', val => evt.coordinate.x = val);
      bindUpdate('.evt-y', val => evt.coordinate.y = val);
      bindUpdate('.evt-w', val => evt.coordinate.width = val);
      bindUpdate('.evt-h', val => evt.coordinate.height = val);

      tr.querySelector('.btn-delete').addEventListener('click', () => {
        this.project.timeline.removeEvent(evt.id);
      });
      this.tbody.appendChild(tr);
    }
  }
}
