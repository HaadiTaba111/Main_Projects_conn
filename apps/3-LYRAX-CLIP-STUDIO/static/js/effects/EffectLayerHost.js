function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function safeId(value, fallback) {
    return String(value || fallback).replace(/[^A-Za-z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

export class EffectLayerHost {
    constructor({
        selectorId = 'effectTypeSelect',
        addButtonId = 'addEffectLayerBtn',
        layersContainerId = 'effectLayersList',
        quickActionsId = 'effectQuickActions',
        statusId = 'effectRegistryStatus',
        getCurrentTime = () => 0,
        getRuntime = () => ({}),
        onChange = () => {}
    } = {}) {
        this.selector = document.getElementById(selectorId);
        this.addButton = document.getElementById(addButtonId);
        this.container = document.getElementById(layersContainerId);
        this.quickActions = document.getElementById(quickActionsId);
        this.status = document.getElementById(statusId);
        this.getCurrentTime = getCurrentTime;
        this.getRuntime = getRuntime;
        this.onChange = onChange;
        this.specs = new Map();
        this.modules = new Map();
        this.layers = [];
        this.states = new Map();
        this.canvases = new Map();
        this.nextId = 1;
    }

    async initialize() {
        if (this.addButton) this.addButton.addEventListener('click', () => this.addLayer(this.selector?.value));
        try {
            const response = await fetch('/api/effects', { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            const specs = Array.isArray(payload.effects) ? payload.effects : [];
            const results = await Promise.allSettled(specs.map(async spec => {
                if (!spec?.id || !spec.preview_module) throw new Error('manifest lacks id/preview_module');
                const module = await import(spec.preview_module);
                if (typeof module.renderPreview !== 'function') throw new Error(`${spec.id} has no renderPreview()`);
                this.specs.set(spec.id, spec);
                this.modules.set(spec.id, module);
            }));
            const failed = results.filter(result => result.status === 'rejected').length;
            if (this.status) {
                this.status.textContent = failed
                    ? `⚠️ ${this.specs.size} ماژول آماده شد؛ ${failed} ماژول بارگذاری نشد.`
                    : `✅ ${this.specs.size} ماژول افکت به‌صورت خودکار کشف شد.`;
            }
            this.render();
            return this;
        } catch (error) {
            console.error('Effect plugin discovery failed:', error);
            if (this.status) this.status.textContent = '⚠️ فهرست افکت‌ها از سرور دریافت نشد؛ صفحه را از Flask باز کن.';
            this.render();
            return this;
        }
    }

    addLayer(type) {
        const spec = this.specs.get(type);
        if (!spec) return null;
        const id = `fx-${safeId(type, 'effect')}-${Date.now().toString(36)}-${this.nextId++}`;
        const layer = {
            id,
            type,
            name: spec.name || type,
            enabled: true,
            order: this.layers.length,
            start_time: 0,
            end_time: null,
            settings: clone(spec.defaults || {}),
            events: []
        };
        this.layers.push(layer);
        this.render();
        this.onChange();
        return layer;
    }

    setLayers(layers) {
        const input = Array.isArray(layers) ? layers : [];
        this.layers = input.map((item, index) => {
            const type = String(item?.type || item?.effect_type || '');
            const spec = this.specs.get(type);
            const settings = item?.settings && typeof item.settings === 'object' ? clone(item.settings) : {};
            const startTime = Math.max(0, Number(item?.start_time) || 0);
            const rawEndTime = item?.end_time === null || item?.end_time === undefined || item?.end_time === ''
                ? null : Number(item.end_time);
            const endTime = rawEndTime === null || !Number.isFinite(rawEndTime)
                ? null : Math.max(startTime, rawEndTime);
            const rawEnabled = item?.enabled;
            const enabled = typeof rawEnabled === 'string'
                ? !['', '0', 'false', 'no', 'off'].includes(rawEnabled.trim().toLowerCase())
                : rawEnabled !== false;
            const events = Array.isArray(item?.events) ? clone(item.events).map(event => {
                if (typeof event === 'number' || (typeof event === 'string' && event.trim() && Number.isFinite(Number(event)))) {
                    return { t: Number(event), tier: 1 };
                }
                if (!event || typeof event !== 'object') return null;
                const t = Number(event.t ?? event.time);
                return Number.isFinite(t) ? { ...event, t } : null;
            }).filter(Boolean) : [];
            return {
                id: safeId(item?.id, `fx-${safeId(type, 'unknown')}-${index + 1}`),
                type,
                name: String(item?.name || spec?.name || type || `Effect ${index + 1}`),
                enabled,
                order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
                start_time: startTime,
                end_time: endTime,
                settings: { ...(spec?.defaults || {}), ...settings },
                events
            };
        });
        this.states.clear();
        this.canvases.clear();
        this.render();
        this.onChange();
    }

    loadProject(data) {
        const hasLegacyLightning = Boolean(data?.lightning) || Array.isArray(data?.manual_lightning_timestamps);
        if (Array.isArray(data?.effect_layers) && (data.effect_layers.length > 0 || !hasLegacyLightning)) {
            const layers = clone(data.effect_layers);
            const hasLightningLayer = layers.some(layer => (layer?.type || layer?.effect_type) === 'lightning');
            if (hasLegacyLightning && !hasLightningLayer) {
                layers.push(this._legacyLightningLayer(data, layers.length));
            }
            this.setLayers(layers);
            return;
        }
        if (hasLegacyLightning) {
            this.setLayers([this._legacyLightningLayer(data, 0)]);
            return;
        }
        this.setLayers([]);
    }

    _legacyLightningLayer(data, order = 0) {
        const settings = data?.lightning && typeof data.lightning === 'object' ? clone(data.lightning) : {};
        const events = (Array.isArray(data?.manual_lightning_timestamps) ? data.manual_lightning_timestamps : []).map(item => {
            if (typeof item === 'number') return { t: item, tier: 1 };
            return { t: Number(item?.t ?? item?.time) || 0, tier: Number(item?.tier) || 1 };
        });
        let enabled = settings.enabled;
        if (enabled === undefined) enabled = Object.keys(settings).length > 0 || events.length > 0;
        if (typeof enabled === 'string') enabled = !['', '0', 'false', 'no', 'off'].includes(enabled.trim().toLowerCase());
        return {
            id: 'legacy-lightning', type: 'lightning', name: 'رعدوبرق',
            enabled: Boolean(enabled),
            order, start_time: 0, end_time: null, settings, events
        };
    }

    getLayers() {
        return clone(this.layers);
    }

    getLayer(layerId) {
        return this.layers.find(layer => layer.id === layerId) || null;
    }

    updateSetting(layerId, key, value) {
        const layer = this.getLayer(layerId);
        if (!layer) return;
        layer.settings[key] = value;
        this.onChange();
    }

    updateEvent(layerId, eventIndex, key, value) {
        const layer = this.getLayer(layerId);
        const event = layer?.events?.[Number(eventIndex)];
        if (!event) return;
        event[key] = value;
        this.render();
        this.onChange();
    }

    deleteEvent(layerId, eventIndex) {
        const layer = this.getLayer(layerId);
        if (!layer || !Array.isArray(layer.events)) return;
        layer.events.splice(Number(eventIndex), 1);
        this.render();
        this.onChange();
    }

    removeLayer(layerId) {
        this.layers = this.layers.filter(layer => layer.id !== layerId);
        this.states.delete(layerId);
        this.canvases.delete(layerId);
        this.layers.forEach((layer, index) => { layer.order = index; });
        this.render();
        this.onChange();
    }

    moveLayer(layerId, delta) {
        const ordered = [...this.layers].sort((a, b) => a.order - b.order);
        const index = ordered.findIndex(layer => layer.id === layerId);
        const next = index + Number(delta);
        if (index < 0 || next < 0 || next >= ordered.length) return;
        [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
        ordered.forEach((layer, order) => { layer.order = order; });
        this.layers = ordered;
        this.render();
        this.onChange();
    }

    triggerManual(layerId, triggerId) {
        const layer = this.getLayer(layerId);
        const module = layer && this.modules.get(layer.type);
        if (!layer || !module || typeof module.createManualEvent !== 'function') return;
        const event = module.createManualEvent({
            layer,
            time: Math.max(0, Number(this.getCurrentTime()) || 0),
            triggerId,
            runtime: this.getRuntime()
        });
        if (!event || !Number.isFinite(Number(event.t))) return;
        layer.events ||= [];
        layer.events.push(event);
        this.render();
        this.onChange();
    }

    resetRuntime() {
        this.states.clear();
    }

    update(timeSeconds, runtime = {}) {
        const time = Number(timeSeconds) || 0;
        for (const layer of this.layers) {
            if (!layer.enabled) continue;
            const module = this.modules.get(layer.type);
            if (!module || typeof module.updateLayer !== 'function') continue;
            const state = this.states.get(layer.id) || {};
            module.updateLayer(layer, time, runtime, state);
            this.states.set(layer.id, state);
        }
    }

    renderFrame(targetContext, timeSeconds, runtime = {}) {
        if (!targetContext) return;
        const time = Number(timeSeconds) || 0;
        const width = Number(runtime.width) || targetContext.canvas.width;
        const height = Number(runtime.height) || targetContext.canvas.height;
        const ordered = [...this.layers].sort((a, b) => a.order - b.order);
        for (const layer of ordered) {
            if (!layer.enabled) continue;
            const module = this.modules.get(layer.type);
            if (!module) continue;
            const start = Number(layer.start_time) || 0;
            const end = layer.end_time === null || layer.end_time === undefined ? Infinity : Number(layer.end_time);
            const { canvas, context } = this._getLayerCanvas(layer.id, width, height);
            context.clearRect(0, 0, width, height);
            const state = this.states.get(layer.id) || {};
            try {
                if (time >= start && time <= end) module.renderPreview(context, layer, time, state, { ...runtime, width, height });
                targetContext.drawImage(canvas, 0, 0, width, height);
            } catch (error) {
                console.error(`Effect layer ${layer.id} failed in preview:`, error);
            }
        }
    }

    _getLayerCanvas(layerId, width, height) {
        let entry = this.canvases.get(layerId);
        if (!entry) {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            entry = { canvas, context };
            this.canvases.set(layerId, entry);
        }
        if (entry.canvas.width !== width) entry.canvas.width = width;
        if (entry.canvas.height !== height) entry.canvas.height = height;
        return entry;
    }

    render() {
        if (this.selector) {
            const previous = this.selector.value;
            this.selector.replaceChildren();
            for (const spec of this.specs.values()) {
                const option = document.createElement('option');
                option.value = spec.id;
                option.textContent = `${spec.icon || '✨'} ${spec.name || spec.id}`;
                this.selector.appendChild(option);
            }
            if ([...this.specs.keys()].includes(previous)) this.selector.value = previous;
            if (this.addButton) this.addButton.disabled = this.specs.size === 0;
        }
        if (this.container) {
            this.container.replaceChildren();
            const layers = [...this.layers].sort((a, b) => a.order - b.order);
            if (!layers.length) {
                const empty = document.createElement('div');
                empty.className = 'effect-empty-state';
                empty.textContent = 'هنوز لایه‌ی افکتی اضافه نشده؛ نوع افکت را انتخاب و «افزودن لایه» را بزن.';
                this.container.appendChild(empty);
            }
            layers.forEach((layer, index) => this.container.appendChild(this._createLayerCard(layer, index, layers.length)));
        }
        this._renderQuickActions();
    }

    _createLayerCard(layer, index, total) {
        const spec = this.specs.get(layer.type) || { name: layer.type || 'افکت ناشناخته', icon: '❔', controls: [], manual_triggers: [] };
        const card = document.createElement('section');
        card.className = 'effect-layer-card';
        card.dataset.layerId = layer.id;

        const header = document.createElement('div');
        header.className = 'effect-layer-header';
        const title = document.createElement('strong');
        title.textContent = `${spec.icon || '✨'} ${layer.name || spec.name}`;
        const order = document.createElement('span');
        order.className = 'effect-layer-order';
        order.textContent = `لایه ${index + 1}`;
        const enabledLabel = document.createElement('label');
        enabledLabel.className = 'effect-enabled-label';
        const enabled = document.createElement('input');
        enabled.type = 'checkbox';
        enabled.checked = layer.enabled !== false;
        enabled.setAttribute('aria-label', `فعال‌کردن ${layer.name}`);
        enabled.addEventListener('change', () => { layer.enabled = enabled.checked; this.render(); this.onChange(); });
        enabledLabel.append(enabled, document.createTextNode(' فعال'));

        const actions = document.createElement('div');
        actions.className = 'effect-layer-actions';
        const up = this._smallButton('↑', 'بردن لایه بالاتر', () => this.moveLayer(layer.id, -1));
        const down = this._smallButton('↓', 'بردن لایه پایین‌تر', () => this.moveLayer(layer.id, 1));
        const remove = this._smallButton('حذف', 'حذف این لایه', () => this.removeLayer(layer.id), 'effect-remove-button');
        up.disabled = index === 0;
        down.disabled = index === total - 1;
        actions.append(up, down, remove);
        header.append(title, order, enabledLabel, actions);
        card.appendChild(header);

        if (spec.description) {
            const description = document.createElement('p');
            description.className = 'effect-layer-description';
            description.textContent = spec.description;
            card.appendChild(description);
        }

        if (!this.modules.has(layer.type)) {
            const warning = document.createElement('p');
            warning.className = 'effect-layer-warning';
            warning.textContent = 'ماژول پیش‌نمایش این افکت در دسترس نیست؛ تنظیماتش در پروژه حفظ می‌شود.';
            card.appendChild(warning);
        }

        const timeRange = document.createElement('div');
        timeRange.className = 'effect-layer-time-range';
        const startWrap = document.createElement('label');
        startWrap.textContent = 'شروع لایه (s)';
        const startInput = document.createElement('input');
        startInput.type = 'number';
        startInput.min = '0';
        startInput.step = '0.1';
        startInput.value = Number(layer.start_time) || 0;
        startInput.addEventListener('change', () => {
            layer.start_time = Math.max(0, Number(startInput.value) || 0);
            if (layer.end_time !== null && layer.end_time < layer.start_time) {
                layer.end_time = layer.start_time;
                endInput.value = layer.end_time;
            }
            this.onChange();
        });
        startWrap.appendChild(startInput);
        const endWrap = document.createElement('label');
        endWrap.textContent = 'پایان لایه (s؛ خالی = انتهای پروژه)';
        const endInput = document.createElement('input');
        endInput.type = 'number';
        endInput.min = '0';
        endInput.step = '0.1';
        endInput.placeholder = 'بدون محدودیت';
        endInput.value = layer.end_time === null ? '' : layer.end_time;
        endInput.addEventListener('change', () => {
            if (endInput.value === '') layer.end_time = null;
            else layer.end_time = Math.max(Number(startInput.value) || 0, Number(endInput.value) || 0);
            if (layer.end_time !== null) endInput.value = layer.end_time;
            this.onChange();
        });
        endWrap.appendChild(endInput);
        timeRange.append(startWrap, endWrap);
        card.appendChild(timeRange);

        const controls = document.createElement('div');
        controls.className = 'effect-controls-grid';
        for (const control of spec.controls || []) controls.appendChild(this._createControl(layer, control));
        card.appendChild(controls);

        const manualTriggers = Array.isArray(spec.manual_triggers) ? spec.manual_triggers : [];
        if (manualTriggers.length) {
            const triggerWrap = document.createElement('div');
            triggerWrap.className = 'effect-manual-triggers';
            const triggerTitle = document.createElement('span');
            triggerTitle.textContent = 'تریگر دستی روی همین لایه:';
            triggerWrap.appendChild(triggerTitle);
            for (const trigger of manualTriggers) {
                const button = this._smallButton(trigger.label || 'اجرا', `اجرای ${trigger.label || spec.name}`, () => this.triggerManual(layer.id, trigger.id), 'effect-trigger-button');
                triggerWrap.appendChild(button);
            }
            card.appendChild(triggerWrap);
        }
        const eventCount = document.createElement('div');
        eventCount.className = 'effect-layer-event-count';
        eventCount.textContent = `${Array.isArray(layer.events) ? layer.events.length : 0} رویداد دستی ذخیره‌شده`;
        card.appendChild(eventCount);
        return card;
    }

    _createControl(layer, control) {
        const wrap = document.createElement('label');
        wrap.className = 'effect-control';
        const caption = document.createElement('span');
        caption.textContent = control.label || control.key;
        wrap.appendChild(caption);
        let input;
        const value = layer.settings?.[control.key] ?? control.default ?? '';
        if (control.type === 'select') {
            input = document.createElement('select');
            for (const item of control.options || []) {
                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.label || item.value;
                input.appendChild(option);
            }
            input.value = String(value);
        } else if (control.type === 'checkbox') {
            input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = Boolean(value);
        } else {
            input = document.createElement('input');
            input.type = ['range', 'color', 'number', 'text'].includes(control.type) ? control.type : 'text';
            if (control.min !== undefined) input.min = control.min;
            if (control.max !== undefined) input.max = control.max;
            if (control.step !== undefined) input.step = control.step;
            input.value = value;
        }
        input.addEventListener(control.type === 'range' ? 'input' : 'change', () => {
            let nextValue;
            if (control.type === 'checkbox') nextValue = input.checked;
            else if (control.type === 'number' || control.type === 'range') nextValue = Number(input.value);
            else nextValue = input.value;
            layer.settings ||= {};
            layer.settings[control.key] = nextValue;
            const output = wrap.querySelector('output');
            if (output) output.textContent = `${input.value}${control.suffix || ''}`;
            this.onChange();
        });
        wrap.appendChild(input);
        if (control.type === 'range') {
            const output = document.createElement('output');
            output.textContent = `${input.value}${control.suffix || ''}`;
            wrap.appendChild(output);
        }
        return wrap;
    }

    _smallButton(text, title, onClick, className = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `effect-small-button ${className}`.trim();
        button.textContent = text;
        button.title = title;
        button.addEventListener('click', onClick);
        return button;
    }

    _renderQuickActions() {
        if (!this.quickActions) return;
        this.quickActions.replaceChildren();
        const layers = [...this.layers].sort((a, b) => a.order - b.order).filter(layer => layer.enabled);
        for (const layer of layers) {
            const spec = this.specs.get(layer.type);
            if (!spec?.manual_triggers?.length) continue;
            const group = document.createElement('div');
            group.className = 'effect-quick-group';
            const label = document.createElement('span');
            label.textContent = `${spec.icon || '✨'} ${layer.name || spec.name}`;
            group.appendChild(label);
            for (const trigger of spec.manual_triggers) {
                const button = this._smallButton(trigger.label || 'اجرا', `تریگر دستی ${trigger.label || spec.name}`, () => this.triggerManual(layer.id, trigger.id), 'effect-trigger-button');
                group.appendChild(button);
            }
            this.quickActions.appendChild(group);
        }
        if (!layers.length) {
            const hint = document.createElement('span');
            hint.className = 'effect-quick-hint';
            hint.textContent = 'با افزودن لایه‌ی افکت، تریگرهای دستی اینجا ظاهر می‌شوند.';
            this.quickActions.appendChild(hint);
        }
    }
}
