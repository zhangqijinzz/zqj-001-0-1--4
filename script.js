class BrainDumpApp {
    constructor() {
        this.thoughts = this.loadFromStorage('thoughts') || [];
        this.tomorrowItems = this.loadFromStorage('tomorrowItems') || [];
        this.currentTab = 'jot';
        this.breathingActive = false;
        this.ritualTimer = null;
        this.selectedNoise = null;
        this.lastSelectedCategory = 'todo';
        this.audioContext = null;
        this.activeNodes = [];
        this.masterGain = null;
        this.fadeOutTimer = null;
        this.undoStack = [];
        this.redoStack = [];
        this.MAX_HISTORY = 20;
        this.BACKUP_VERSION = 1;
        this.searchIndex = null;
        this.searchDebounceTimer = null;
        this.SEARCH_DEBOUNCE_MS = 200;
        this.searchQuery = '';
        this.filters = {
            categories: ['todo', 'worry', 'idea'],
            dateFrom: null,
            dateTo: null,
            timeSlots: ['morning', 'afternoon', 'evening', 'night'],
            sortBy: 'date-desc'
        };

        this.reminderSettings = this.loadFromStorage('reminderSettings') || {
            enabled: false,
            time: '22:30',
            repeatMode: 'daily',
            title: '该准备睡觉了',
            message: '放下手机，开始睡前整理吧',
            sound: true
        };
        this.reminderCheckInterval = null;
        this.lastReminderDate = null;
        this.broadcastChannel = null;
        
        this.init();
    }

    init() {
        this.migrateData();
        this.setupTabs();
        this.setupThoughtInput();
        this.setupBreatheSection();
        this.setupTomorrowSection();
        this.setupRitualSection();
        this.setupUndoRedo();
        this.setupBackup();
        this.setupSearchSystem();
        this.setupInsights();
        this.setupReminderSystem();
        this.buildSearchIndex();
        this.renderThoughts();
        this.renderTomorrowList();
        this.renderBreatheList();
    }

    migrateData() {
        let needsSave = false;
        
        this.thoughts = this.thoughts.map(thought => {
            if (!thought.editHistory) {
                needsSave = true;
                return {
                    ...thought,
                    editHistory: [{
                        text: thought.text,
                        timestamp: thought.createdAt,
                        isOriginal: true
                    }]
                };
            }
            return thought;
        });
        
        if (needsSave) {
            this.saveToStorage('thoughts', this.thoughts);
        }
    }

    initAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        return this.audioContext;
    }

    createNoiseBuffer(duration, type) {
        const ctx = this.audioContext;
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * duration;
        const buffer = ctx.createBuffer(2, length, sampleRate);
        const fadeSamples = Math.floor(sampleRate * 0.05);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            if (type === 'white') {
                for (let i = 0; i < length; i++) {
                    data[i] = Math.random() * 2 - 1;
                }
            } else if (type === 'pink') {
                let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
                for (let i = 0; i < length; i++) {
                    const w = Math.random() * 2 - 1;
                    b0 = 0.99886 * b0 + w * 0.0555179;
                    b1 = 0.99332 * b1 + w * 0.0750759;
                    b2 = 0.96900 * b2 + w * 0.1538520;
                    b3 = 0.86650 * b3 + w * 0.3104856;
                    b4 = 0.55000 * b4 + w * 0.5329522;
                    b5 = -0.7616 * b5 - w * 0.0168980;
                    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
                    b6 = w * 0.115926;
                }
            } else if (type === 'brown') {
                let last = 0;
                for (let i = 0; i < length; i++) {
                    const w = Math.random() * 2 - 1;
                    data[i] = (last + 0.02 * w) / 1.02;
                    last = data[i];
                    data[i] *= 3.5;
                }
            }

            for (let i = 0; i < fadeSamples; i++) {
                const f = i / fadeSamples;
                data[i] *= f;
                data[length - 1 - i] *= f;
            }
        }
        return buffer;
    }

    createCrackleBuffer(duration, density) {
        const ctx = this.audioContext;
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * duration;
        const buffer = ctx.createBuffer(2, length, sampleRate);
        const fadeSamples = Math.floor(sampleRate * 0.05);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            let i = 0;
            while (i < length) {
                if (Math.random() < density) {
                    const burstLen = Math.floor(sampleRate * (0.001 + Math.random() * 0.003));
                    const amp = 0.3 + Math.random() * 0.7;
                    for (let j = 0; j < burstLen && (i + j) < length; j++) {
                        const env = Math.exp(-j / (burstLen * 0.3));
                        data[i + j] = (Math.random() * 2 - 1) * amp * env;
                    }
                    i += burstLen;
                } else {
                    data[i] = 0;
                    i++;
                }
            }

            for (let i = 0; i < fadeSamples; i++) {
                const f = i / fadeSamples;
                data[i] *= f;
                data[length - 1 - i] *= f;
            }
        }
        return buffer;
    }

    createChirpBuffer(duration) {
        const ctx = this.audioContext;
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * duration;
        const buffer = ctx.createBuffer(2, length, sampleRate);
        const fadeSamples = Math.floor(sampleRate * 0.05);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            let i = 0;
            while (i < length) {
                const gap = Math.floor(sampleRate * (0.8 + Math.random() * 2.5));
                i += gap;
                if (i >= length) break;

                const baseFreq = 2200 + Math.random() * 2000;
                const freqRange = 400 + Math.random() * 800;
                const numNotes = 2 + Math.floor(Math.random() * 3);
                const noteLen = Math.floor(sampleRate * (0.04 + Math.random() * 0.06));

                for (let n = 0; n < numNotes && i < length; n++) {
                    for (let j = 0; j < noteLen && (i + j) < length; j++) {
                        const t = j / sampleRate;
                        const freq = baseFreq + freqRange * j / noteLen;
                        const env = Math.sin(Math.PI * j / noteLen);
                        data[i + j] += Math.sin(2 * Math.PI * freq * t) * env * 0.25;
                    }
                    i += noteLen + Math.floor(sampleRate * 0.02);
                }
            }

            for (let i = 0; i < fadeSamples; i++) {
                const f = i / fadeSamples;
                data[i] *= f;
                data[length - 1 - i] *= f;
            }
        }
        return buffer;
    }

    startAmbientSound(type) {
        this.stopAmbientSound();

        const ctx = this.initAudioContext();
        this.masterGain = ctx.createGain();

        const slider = document.getElementById('volumeSlider');
        const initialVolume = slider ? parseFloat(slider.value) / 100 : 0.5;
        this.masterGain.gain.value = initialVolume;

        this.masterGain.connect(ctx.destination);

        const whiteBuf = this.createNoiseBuffer(4, 'white');
        const pinkBuf = this.createNoiseBuffer(4, 'pink');
        const brownBuf = this.createNoiseBuffer(4, 'brown');

        switch (type) {
            case 'rain': this.buildRain(ctx, whiteBuf, pinkBuf); break;
            case 'ocean': this.buildOcean(ctx, pinkBuf, whiteBuf); break;
            case 'forest': this.buildForest(ctx, pinkBuf); break;
            case 'fire': this.buildFire(ctx, brownBuf, whiteBuf); break;
        }
    }

    buildRain(ctx, whiteBuf, pinkBuf) {
        const n1 = ctx.createBufferSource();
        n1.buffer = whiteBuf; n1.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 0.5;
        const g1 = ctx.createGain(); g1.gain.value = 0.25;
        n1.connect(bp); bp.connect(g1); g1.connect(this.masterGain);

        const n2 = ctx.createBufferSource();
        n2.buffer = pinkBuf; n2.loop = true;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 400;
        const g2 = ctx.createGain(); g2.gain.value = 0.1;
        n2.connect(lp); lp.connect(g2); g2.connect(this.masterGain);

        const crackle = this.createCrackleBuffer(8, 0.003);
        const n3 = ctx.createBufferSource();
        n3.buffer = crackle; n3.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 2000;
        const g3 = ctx.createGain(); g3.gain.value = 0.08;
        n3.connect(hp); hp.connect(g3); g3.connect(this.masterGain);

        n1.start(); n2.start(); n3.start();
        this.activeNodes = [n1, n2, n3];
    }

    buildOcean(ctx, pinkBuf, whiteBuf) {
        const n1 = ctx.createBufferSource();
        n1.buffer = pinkBuf; n1.loop = true;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 800;
        const g1 = ctx.createGain(); g1.gain.value = 0.18;

        const lfo = ctx.createOscillator();
        lfo.type = 'sine'; lfo.frequency.value = 0.08;
        const lfoG = ctx.createGain(); lfoG.gain.value = 0.14;
        lfo.connect(lfoG); lfoG.connect(g1.gain);

        n1.connect(lp); lp.connect(g1); g1.connect(this.masterGain);

        const n2 = ctx.createBufferSource();
        n2.buffer = whiteBuf; n2.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 3000;
        const lp2 = ctx.createBiquadFilter();
        lp2.type = 'lowpass'; lp2.frequency.value = 6000;
        const g2 = ctx.createGain(); g2.gain.value = 0.05;

        const lfo2 = ctx.createOscillator();
        lfo2.type = 'sine'; lfo2.frequency.value = 0.08;
        const lfoG2 = ctx.createGain(); lfoG2.gain.value = 0.04;
        lfo2.connect(lfoG2); lfoG2.connect(g2.gain);

        n2.connect(hp); hp.connect(lp2); lp2.connect(g2); g2.connect(this.masterGain);

        n1.start(); n2.start(); lfo.start(); lfo2.start();
        this.activeNodes = [n1, n2, lfo, lfo2];
    }

    buildForest(ctx, pinkBuf) {
        const n1 = ctx.createBufferSource();
        n1.buffer = pinkBuf; n1.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.3;
        const g1 = ctx.createGain(); g1.gain.value = 0.08;

        const lfo = ctx.createOscillator();
        lfo.type = 'sine'; lfo.frequency.value = 0.05;
        const lfoG = ctx.createGain(); lfoG.gain.value = 0.04;
        lfo.connect(lfoG); lfoG.connect(g1.gain);

        n1.connect(bp); bp.connect(g1); g1.connect(this.masterGain);

        const cr1 = ctx.createOscillator();
        cr1.type = 'sine'; cr1.frequency.value = 4200;
        const cg1 = ctx.createGain(); cg1.gain.value = 0.02;
        const am1 = ctx.createOscillator();
        am1.type = 'square'; am1.frequency.value = 6;
        const amG1 = ctx.createGain(); amG1.gain.value = 0.015;
        am1.connect(amG1); amG1.connect(cg1.gain);
        cr1.connect(cg1); cg1.connect(this.masterGain);

        const cr2 = ctx.createOscillator();
        cr2.type = 'sine'; cr2.frequency.value = 3800;
        const cg2 = ctx.createGain(); cg2.gain.value = 0.015;
        const am2 = ctx.createOscillator();
        am2.type = 'square'; am2.frequency.value = 5;
        const amG2 = ctx.createGain(); amG2.gain.value = 0.012;
        am2.connect(amG2); amG2.connect(cg2.gain);
        cr2.connect(cg2); cg2.connect(this.masterGain);

        const chirpBuf = this.createChirpBuffer(6);
        const chirp = ctx.createBufferSource();
        chirp.buffer = chirpBuf; chirp.loop = true;
        const cg3 = ctx.createGain(); cg3.gain.value = 0.06;
        chirp.connect(cg3); cg3.connect(this.masterGain);

        n1.start(); lfo.start();
        cr1.start(); am1.start();
        cr2.start(); am2.start();
        chirp.start();
        this.activeNodes = [n1, lfo, cr1, am1, cr2, am2, chirp];
    }

    buildFire(ctx, brownBuf, whiteBuf) {
        const n1 = ctx.createBufferSource();
        n1.buffer = brownBuf; n1.loop = true;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 200;
        const g1 = ctx.createGain(); g1.gain.value = 0.2;
        n1.connect(lp); lp.connect(g1); g1.connect(this.masterGain);

        const crackle = this.createCrackleBuffer(6, 0.005);
        const n2 = ctx.createBufferSource();
        n2.buffer = crackle; n2.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.8;
        const g2 = ctx.createGain(); g2.gain.value = 0.15;
        n2.connect(bp); bp.connect(g2); g2.connect(this.masterGain);

        const n3 = ctx.createBufferSource();
        n3.buffer = whiteBuf; n3.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 4000;
        const g3 = ctx.createGain(); g3.gain.value = 0.02;
        n3.connect(hp); hp.connect(g3); g3.connect(this.masterGain);

        n1.start(); n2.start(); n3.start();
        this.activeNodes = [n1, n2, n3];
    }

    stopAmbientSound() {
        if (this.fadeOutTimer) {
            clearTimeout(this.fadeOutTimer);
            this.fadeOutTimer = null;
        }

        this.activeNodes.forEach(node => {
            try { node.stop(); } catch (e) {}
        });
        this.activeNodes = [];
        if (this.masterGain) {
            try { this.masterGain.disconnect(); } catch (e) {}
            this.masterGain = null;
        }
    }

    fadeOutAmbientSound(duration, callback) {
        if (this.fadeOutTimer) {
            clearTimeout(this.fadeOutTimer);
            this.fadeOutTimer = null;
        }

        if (this.masterGain && this.audioContext) {
            const ctx = this.audioContext;
            const now = ctx.currentTime;
            this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
            this.masterGain.gain.linearRampToValueAtTime(0, now + duration);
            this.fadeOutTimer = setTimeout(() => {
                this.stopAmbientSound();
                if (callback) callback();
            }, duration * 1000);
        } else {
            this.stopAmbientSound();
            if (callback) callback();
        }
    }

    setVolume(value) {
        if (this.masterGain) {
            this.masterGain.gain.value = value;
        }
    }

    loadFromStorage(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch {
            return null;
        }
    }

    saveToStorage(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    recordState(description) {
        const snapshot = {
            thoughts: JSON.parse(JSON.stringify(this.thoughts)),
            tomorrowItems: JSON.parse(JSON.stringify(this.tomorrowItems)),
            description
        };
        this.undoStack.push(snapshot);
        if (this.undoStack.length > this.MAX_HISTORY) {
            this.undoStack.shift();
        }
        this.redoStack = [];
        this.updateUndoRedoUI();
    }

    undo() {
        if (this.undoStack.length === 0) return;
        const currentSnapshot = {
            thoughts: JSON.parse(JSON.stringify(this.thoughts)),
            tomorrowItems: JSON.parse(JSON.stringify(this.tomorrowItems)),
            description: this.undoStack[this.undoStack.length - 1].description
        };
        this.redoStack.push(currentSnapshot);
        const previousState = this.undoStack.pop();
        this.thoughts = previousState.thoughts;
        this.tomorrowItems = previousState.tomorrowItems;
        this.saveToStorage('thoughts', this.thoughts);
        this.saveToStorage('tomorrowItems', this.tomorrowItems);
        this.buildSearchIndex();
        this.updateView();
        this.renderTomorrowList();
        this.renderBreatheList();
        this.showToast('已撤销: ' + previousState.description);
        this.updateUndoRedoUI();
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const currentSnapshot = {
            thoughts: JSON.parse(JSON.stringify(this.thoughts)),
            tomorrowItems: JSON.parse(JSON.stringify(this.tomorrowItems)),
            description: this.redoStack[this.redoStack.length - 1].description
        };
        this.undoStack.push(currentSnapshot);
        const nextState = this.redoStack.pop();
        this.thoughts = nextState.thoughts;
        this.tomorrowItems = nextState.tomorrowItems;
        this.saveToStorage('thoughts', this.thoughts);
        this.saveToStorage('tomorrowItems', this.tomorrowItems);
        this.buildSearchIndex();
        this.updateView();
        this.renderTomorrowList();
        this.renderBreatheList();
        this.showToast('已重做: ' + nextState.description);
        this.updateUndoRedoUI();
    }

    updateUndoRedoUI() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        const bar = document.getElementById('undoRedoBar');
        if (undoBtn) undoBtn.disabled = this.undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
        if (bar) {
            bar.classList.toggle('has-history', this.undoStack.length > 0 || this.redoStack.length > 0);
        }
    }

    setupUndoRedo() {
        document.addEventListener('keydown', (e) => {
            const isMod = e.ctrlKey || e.metaKey;
            if (isMod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            } else if (isMod && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) {
                e.preventDefault();
                this.redo();
            }
        });
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn) undoBtn.addEventListener('click', () => this.undo());
        if (redoBtn) redoBtn.addEventListener('click', () => this.redo());
    }



    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });
        this.currentTab = tabName;
        
        if (tabName === 'insights') {
            setTimeout(() => this.updateInsights(), 100);
        }
    }

    setupThoughtInput() {
        const catBtns = document.querySelectorAll('.cat-btn');
        const defaultBtn = document.querySelector('.cat-btn[data-category="todo"]');
        if (defaultBtn) defaultBtn.classList.add('active');
        
        catBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                catBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const input = document.getElementById('thoughtInput');
                const text = input.value.trim();
                const category = btn.dataset.category;
                
                this.lastSelectedCategory = category;
                
                if (text) {
                    this.addThought(text, category);
                    input.value = '';
                }
            });
        });

        document.getElementById('thoughtInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const input = document.getElementById('thoughtInput');
                const text = input.value.trim();
                
                if (text) {
                    this.addThought(text, this.lastSelectedCategory);
                    input.value = '';
                }
            }
        });
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(102, 126, 234, 0.9);
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            font-size: 0.95rem;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '1';
        }, 10);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    removeThought(id) {
        this.recordState('删除条目');
        this._removeThoughtFromData(id);
    }

    moveToTomorrow(id) {
        const thought = this.thoughts.find(t => t.id === id);
        if (thought) {
            this.recordState('移动到明日盒子');
            this.addToTomorrow(thought.text);
            this._removeThoughtFromData(id);
        }
    }

    renderThoughts() {
        const categories = ['todo', 'worry', 'idea'];
        categories.forEach(cat => {
            const listEl = document.getElementById(`${cat}List`);
            const items = this.thoughts.filter(t => t.category === cat);
            
            if (items.length === 0) {
                listEl.innerHTML = '<div class="empty-state">暂无内容</div>';
                return;
            }

            listEl.innerHTML = items.map(item => {
                const isEditing = this.editingThoughtId === item.id;
                const hasHistory = item.editHistory && item.editHistory.length > 1;
                const isHistoryExpanded = this.expandedHistoryIds && this.expandedHistoryIds.has(item.id);

                if (isEditing) {
                    return `
                        <div class="thought-item editing">
                            <textarea 
                                class="edit-input" 
                                data-edit-id="${item.id}"
                                onkeydown="app.handleEditKeydown(event, '${item.id}')"
                            >${this.escapeHtml(item.text)}</textarea>
                            <div class="edit-actions">
                                <button onclick="app.saveEditThought('${item.id}', document.querySelector('[data-edit-id=\\'${item.id}\\']').value)" title="保存 (Enter)">✓</button>
                                <button onclick="app.cancelEditThought('${item.id}')" title="取消 (Esc)">✕</button>
                            </div>
                        </div>
                    `;
                }

                return `
                    <div class="thought-item">
                        <span class="text" onclick="app.startEditThought('${item.id}')" title="点击编辑">${this.escapeHtml(item.text)}</span>
                        <div class="actions">
                            ${hasHistory ? `<button onclick="app.toggleHistory('${item.id}')" title="查看修改历史" class="history-btn ${isHistoryExpanded ? 'active' : ''}">📜</button>` : ''}
                            <button onclick="app.moveToTomorrow('${item.id}')" title="移到明天">🌅</button>
                            <button onclick="app.removeThought('${item.id}')" title="删除">✕</button>
                        </div>
                        ${isHistoryExpanded ? this.renderHistoryPanel(item) : ''}
                    </div>
                `;
            }).join('');
        });
    }

    renderHistoryPanel(item) {
        if (!item.editHistory || item.editHistory.length <= 1) return '';
        
        const history = [...item.editHistory].reverse();
        
        return `
            <div class="history-panel">
                <div class="history-header">
                    <span class="history-title">📜 修改历史 (${item.editHistory.length} 个版本)</span>
                </div>
                <div class="history-list">
                    ${history.map((h, idx) => `
                        <div class="history-item ${h.isOriginal ? 'original' : ''}">
                            <div class="history-meta">
                                <span class="history-version">${h.isOriginal ? '🌟 原始版本' : `版本 ${item.editHistory.length - idx}`}</span>
                                <span class="history-time">${this.formatDateTime(h.timestamp)}</span>
                            </div>
                            <div class="history-text">${this.escapeHtml(h.text)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    handleEditKeydown(event, id) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.saveEditThought(id, event.target.value);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            this.cancelEditThought(id);
        }
    }

    addToTomorrow(text) {
        const item = {
            id: this.generateId(),
            text,
            createdAt: new Date().toISOString()
        };
        this.tomorrowItems.push(item);
        this.saveToStorage('tomorrowItems', this.tomorrowItems);
        this.renderTomorrowList();
    }

    removeFromTomorrow(id) {
        this.recordState('删除明日条目');
        this.tomorrowItems = this.tomorrowItems.filter(t => t.id !== id);
        this.saveToStorage('tomorrowItems', this.tomorrowItems);
        this.renderTomorrowList();
    }

    clearTomorrow() {
        if (confirm('确定要清空明日盒子吗？')) {
            this.recordState('清空明日盒子');
            this.tomorrowItems = [];
            this.saveToStorage('tomorrowItems', this.tomorrowItems);
            this.renderTomorrowList();
        }
    }

    exportTomorrow() {
        if (this.tomorrowItems.length === 0) {
            alert('明日盒子是空的');
            return;
        }
        
        const text = this.tomorrowItems.map((item, i) => `${i + 1}. ${item.text}`).join('\n');
        
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                alert('已复制到剪贴板');
            }).catch(() => {
                this.downloadText(text);
            });
        } else {
            this.downloadText(text);
        }
    }

    downloadText(text) {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `明日清单_${new Date().toLocaleDateString()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    renderTomorrowList() {
        const listEl = document.getElementById('tomorrowList');
        
        if (this.tomorrowItems.length === 0) {
            listEl.innerHTML = '<div class="empty-state">把事情交给明天，现在好好休息吧</div>';
            return;
        }

        listEl.innerHTML = this.tomorrowItems.map(item => `
            <div class="tomorrow-item">
                <span class="text">${this.escapeHtml(item.text)}</span>
                <button onclick="app.removeFromTomorrow('${item.id}')" title="删除">✕</button>
            </div>
        `).join('');
    }

    setupTomorrowSection() {
        document.getElementById('clearTomorrow').addEventListener('click', () => this.clearTomorrow());
        document.getElementById('exportTomorrow').addEventListener('click', () => this.exportTomorrow());
    }

    renderBreatheList() {
        const listEl = document.getElementById('breatheList');
        const allThoughts = this.thoughts;
        
        if (allThoughts.length === 0) {
            listEl.innerHTML = '<div class="empty-state">先去记录一些思绪吧</div>';
            return;
        }

        listEl.innerHTML = allThoughts.map(item => `
            <div class="breathe-item" data-id="${item.id}">
                ${this.escapeHtml(item.text)}
            </div>
        `).join('');
    }

    setupBreatheSection() {
        this.breathingModes = {
            relax4: { name: '基础放松', icon: '🧘', inhale: 4, hold1: 4, exhale: 4, hold2: 4, desc: '4-4-4-4', hold2Label: '放松' },
            deep478: { name: '深度放松', icon: '😴', inhale: 4, hold1: 7, exhale: 8, hold2: 0, desc: '4-7-8', hold2Label: '放松' },
            box: { name: '盒式呼吸', icon: '📦', inhale: 4, hold1: 4, exhale: 4, hold2: 4, desc: '4-4-4-4', hold2Label: '保持' },
            energy: { name: '活力呼吸', icon: '⚡', inhale: 6, hold1: 0, exhale: 6, hold2: 0, desc: '6-0-6-0', hold2Label: '放松' },
            custom: { name: '自定义', icon: '⚙️', inhale: 4, hold1: 4, exhale: 4, hold2: 4, desc: '自由设置', hold2Label: '放松' }
        };

        this.currentBreathingMode = 'relax4';
        this.breathingPhases = [];
        this.breathingTimer = null;
        this.breathingPhaseTimerInterval = null;
        this.phaseRemainingSeconds = 0;

        this.voiceGuideSettings = this.loadFromStorage('voiceGuideSettings') || {
            enabled: false,
            volume: 70,
            rate: 80,
            voiceIndex: -1
        };

        document.getElementById('startBreathe').addEventListener('click', () => {
            if (this.breathingActive) {
                this.stopBreathing();
            } else {
                if (this.thoughts.length === 0) {
                    alert('先去记录一些思绪吧');
                    return;
                }
                this.startBreathing();
            }
        });

        this.setupBreathingModes();
        this.setupPhaseConfig();
        this.setupVoiceGuide();
        this.updatePhaseConfigUI();
    }

    setupBreathingModes() {
        const modeBtns = document.querySelectorAll('.breathe-mode-btn');
        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.breathingActive) return;
                modeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentBreathingMode = btn.dataset.mode;
                this.updatePhaseConfigUI();
            });
        });
    }

    updatePhaseConfigUI() {
        const mode = this.breathingModes[this.currentBreathingMode];
        const isCustom = this.currentBreathingMode === 'custom';

        document.getElementById('phaseInhale').textContent = mode.inhale;
        document.getElementById('phaseHold1').textContent = mode.hold1;
        document.getElementById('phaseExhale').textContent = mode.exhale;
        document.getElementById('phaseHold2').textContent = mode.hold2;
        document.getElementById('phaseConfigModeLabel').textContent = `(${mode.name})`;

        document.querySelectorAll('.phase-adjust-btn').forEach(btn => {
            btn.disabled = !isCustom;
            btn.style.opacity = isCustom ? '1' : '0.3';
            btn.style.pointerEvents = isCustom ? 'auto' : 'none';
        });

        document.querySelectorAll('.phase-config-item').forEach(item => {
            const phase = item.dataset.phase;
            const value = mode[phase];
            if (value === 0) {
                item.classList.add('phase-disabled');
            } else {
                item.classList.remove('phase-disabled');
            }
        });

        const hold2Label = item => {
            const labelEl = item.querySelector('label');
            if (this.currentBreathingMode === 'box') {
                labelEl.textContent = '保持';
            } else {
                labelEl.textContent = '放松';
            }
        };
        const hold2Item = document.querySelector('.phase-config-item[data-phase="hold2"]');
        if (hold2Item) hold2Label(hold2Item);
    }

    setupPhaseConfig() {
        document.querySelectorAll('.phase-adjust-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.breathingActive) return;
                if (this.currentBreathingMode !== 'custom') return;

                const phase = btn.dataset.phase;
                const action = btn.dataset.action;
                const mode = this.breathingModes.custom;
                const delta = action === 'increase' ? 1 : -1;

                let newVal = mode[phase] + delta;
                if (phase === 'inhale' || phase === 'exhale') {
                    newVal = Math.max(1, Math.min(20, newVal));
                } else {
                    newVal = Math.max(0, Math.min(20, newVal));
                }

                mode[phase] = newVal;
                this.updatePhaseConfigUI();
            });
        });
    }

    getActivePhases() {
        const mode = this.breathingModes[this.currentBreathingMode];
        const phases = [];
        phases.push({ key: 'inhale', text: '吸气', duration: mode.inhale * 1000, scaleTarget: 1.3 });
        if (mode.hold1 > 0) {
            phases.push({ key: 'hold1', text: this.currentBreathingMode === 'box' ? '保持' : '保持', duration: mode.hold1 * 1000, scaleTarget: 1.3 });
        }
        phases.push({ key: 'exhale', text: '呼气', duration: mode.exhale * 1000, scaleTarget: 1.0 });
        if (mode.hold2 > 0) {
            const hold2Text = this.currentBreathingMode === 'box' ? '保持' : '放松';
            phases.push({ key: 'hold2', text: hold2Text, duration: mode.hold2 * 1000, scaleTarget: 1.0 });
        }
        return phases;
    }

    startBreathing() {
        if (this.breathingActive) return;

        this.breathingActive = true;
        const breatheCircle = document.getElementById('breatheCircle');
        const breatheText = document.getElementById('breatheText');
        const breatheInstruction = document.getElementById('breatheInstruction');
        const phaseTimerEl = document.getElementById('breathePhaseTimer');
        const startBtn = document.getElementById('startBreathe');

        startBtn.textContent = '停止练习';
        phaseTimerEl.style.display = 'flex';

        this.breathingPhases = this.getActivePhases();

        breatheCircle.classList.add('active');

        const instructionTexts = {
            relax4: '基础放松呼吸，让身心回归平静',
            deep478: '深度放松呼吸，释放深层压力',
            box: '盒式呼吸，专注而平衡',
            energy: '活力呼吸，唤醒身心能量',
            custom: '自定义呼吸，按你的节奏来'
        };
        breatheInstruction.textContent = instructionTexts[this.currentBreathingMode] || '跟随呼吸节奏，让思绪慢慢消散';

        let phaseIndex = 0;
        let cycleCount = 0;
        const items = document.querySelectorAll('.breathe-item');
        let itemIndex = 0;
        const processedIds = [];

        const runPhase = () => {
            if (!this.breathingActive) return;

            const currentPhase = this.breathingPhases[phaseIndex];
            breatheText.textContent = currentPhase.text;

            this.speakPhase(currentPhase.text);

            this.startPhaseCountdown(currentPhase.duration / 1000);

            this.animateBreathCircle(currentPhase);

            this.breathingTimer = setTimeout(() => {
                phaseIndex++;

                if (phaseIndex >= this.breathingPhases.length) {
                    phaseIndex = 0;
                    cycleCount++;

                    if (cycleCount % 2 === 0 && itemIndex < items.length) {
                        const currentItem = items[itemIndex];
                        if (currentItem) {
                            currentItem.classList.add('fading');
                            const id = currentItem.dataset.id;
                            processedIds.push(id);
                            itemIndex++;
                        }
                    }
                }

                if (itemIndex < items.length || phaseIndex !== 0 || cycleCount < 2) {
                    runPhase();
                } else {
                    setTimeout(() => {
                        if (processedIds.length > 0) {
                            this.recordState('呼吸练习清理');
                            processedIds.forEach(id => {
                                this.thoughts = this.thoughts.filter(t => t.id !== id);
                            });
                            this.saveToStorage('thoughts', this.thoughts);
                            this.buildSearchIndex();
                            this.updateView();
                            this.renderBreatheList();
                        }
                        this.stopBreathing();
                    }, 6000);
                }
            }, currentPhase.duration);
        };

        runPhase();
    }

    animateBreathCircle(phase) {
        const circle = document.getElementById('breatheCircle');
        const duration = phase.duration;

        circle.style.transition = `transform ${duration}ms ease-in-out, opacity ${duration}ms ease-in-out`;

        if (phase.scaleTarget > 1) {
            circle.style.transform = `scale(${phase.scaleTarget})`;
            circle.style.opacity = '1';
        } else {
            circle.style.transform = 'scale(1)';
            circle.style.opacity = '0.5';
        }
    }

    startPhaseCountdown(totalSeconds) {
        if (this.breathingPhaseTimerInterval) {
            clearInterval(this.breathingPhaseTimerInterval);
        }

        this.phaseRemainingSeconds = totalSeconds;
        const display = document.getElementById('phaseTimerValue');
        display.textContent = Math.ceil(this.phaseRemainingSeconds);

        this.breathingPhaseTimerInterval = setInterval(() => {
            this.phaseRemainingSeconds -= 0.1;
            if (this.phaseRemainingSeconds <= 0) {
                this.phaseRemainingSeconds = 0;
                clearInterval(this.breathingPhaseTimerInterval);
            }
            display.textContent = Math.ceil(this.phaseRemainingSeconds);
        }, 100);
    }

    stopBreathing() {
        this.breathingActive = false;

        if (this.breathingTimer) {
            clearTimeout(this.breathingTimer);
            this.breathingTimer = null;
        }
        if (this.breathingPhaseTimerInterval) {
            clearInterval(this.breathingPhaseTimerInterval);
            this.breathingPhaseTimerInterval = null;
        }

        const breatheCircle = document.getElementById('breatheCircle');
        const breatheText = document.getElementById('breatheText');
        const breatheInstruction = document.getElementById('breatheInstruction');
        const phaseTimerEl = document.getElementById('breathePhaseTimer');
        const startBtn = document.getElementById('startBreathe');

        breatheCircle.classList.remove('active');
        breatheCircle.style.transition = 'transform 1s ease, opacity 1s ease';
        breatheCircle.style.transform = 'scale(1)';
        breatheCircle.style.opacity = '0.5';
        breatheText.textContent = '完成了';
        breatheInstruction.textContent = '跟随呼吸节奏，让思绪慢慢消散';
        phaseTimerEl.style.display = 'none';
        startBtn.textContent = '开始呼吸练习';

        this.stopVoiceGuide();

        setTimeout(() => {
            breatheText.textContent = '准备开始';
            breatheCircle.style.transition = '';
        }, 2000);
    }

    setupVoiceGuide() {
        const enabledCheckbox = document.getElementById('voiceGuideEnabled');
        const volumeSlider = document.getElementById('voiceVolume');
        const rateSlider = document.getElementById('voiceRate');
        const voiceSelect = document.getElementById('voiceSelect');
        const testBtn = document.getElementById('voiceTestBtn');
        const controlsEl = document.getElementById('voiceGuideControls');

        enabledCheckbox.checked = this.voiceGuideSettings.enabled;
        volumeSlider.value = this.voiceGuideSettings.volume;
        rateSlider.value = this.voiceGuideSettings.rate;

        this.updateVoiceControlVisibility();
        this.updateVoiceDisplayValues();
        this.populateVoiceList();

        if ('speechSynthesis' in window) {
            speechSynthesis.onvoiceschanged = () => this.populateVoiceList();
        }

        enabledCheckbox.addEventListener('change', (e) => {
            this.voiceGuideSettings.enabled = e.target.checked;
            this.saveVoiceGuideSettings();
            this.updateVoiceControlVisibility();
            if (!e.target.checked) {
                this.stopVoiceGuide();
            }
        });

        volumeSlider.addEventListener('input', (e) => {
            this.voiceGuideSettings.volume = parseInt(e.target.value);
            this.updateVoiceDisplayValues();
            this.saveVoiceGuideSettings();
        });

        rateSlider.addEventListener('input', (e) => {
            this.voiceGuideSettings.rate = parseInt(e.target.value);
            this.updateVoiceDisplayValues();
            this.saveVoiceGuideSettings();
        });

        voiceSelect.addEventListener('change', (e) => {
            this.voiceGuideSettings.voiceIndex = parseInt(e.target.value);
            this.saveVoiceGuideSettings();
        });

        testBtn.addEventListener('click', () => {
            this.speakPhase('吸气', true);
        });
    }

    populateVoiceList() {
        const voiceSelect = document.getElementById('voiceSelect');
        if (!voiceSelect || !('speechSynthesis' in window)) return;

        const voices = speechSynthesis.getVoices();
        voiceSelect.innerHTML = '<option value="-1">默认语音</option>';

        const zhVoices = [];
        const otherVoices = [];

        voices.forEach((voice, index) => {
            const isZh = voice.lang.startsWith('zh') || voice.lang.startsWith('cmn');
            if (isZh) {
                zhVoices.push({ voice, index });
            } else {
                otherVoices.push({ voice, index });
            }
        });

        if (zhVoices.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = '中文语音';
            zhVoices.forEach(({ voice, index }) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `${voice.name} (${voice.lang})`;
                optgroup.appendChild(option);
            });
            voiceSelect.appendChild(optgroup);
        }

        if (otherVoices.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = '其他语音';
            otherVoices.slice(0, 20).forEach(({ voice, index }) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `${voice.name} (${voice.lang})`;
                optgroup.appendChild(option);
            });
            voiceSelect.appendChild(optgroup);
        }

        if (this.voiceGuideSettings.voiceIndex >= 0) {
            voiceSelect.value = this.voiceGuideSettings.voiceIndex;
        }
    }

    updateVoiceControlVisibility() {
        const controlsEl = document.getElementById('voiceGuideControls');
        if (controlsEl) {
            controlsEl.style.display = this.voiceGuideSettings.enabled ? 'block' : 'none';
        }
    }

    updateVoiceDisplayValues() {
        const volumeValue = document.getElementById('voiceVolumeValue');
        const rateValue = document.getElementById('voiceRateValue');
        if (volumeValue) volumeValue.textContent = this.voiceGuideSettings.volume + '%';
        if (rateValue) rateValue.textContent = (this.voiceGuideSettings.rate / 100).toFixed(1) + 'x';
    }

    saveVoiceGuideSettings() {
        this.saveToStorage('voiceGuideSettings', this.voiceGuideSettings);
    }

    speakPhase(text, isTest = false) {
        if (!this.voiceGuideSettings.enabled && !isTest) return;
        if (!('speechSynthesis' in window)) return;

        speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = this.voiceGuideSettings.volume / 100;
        utterance.rate = this.voiceGuideSettings.rate / 100;
        utterance.pitch = 0.9;

        const voices = speechSynthesis.getVoices();
        const selectedIndex = this.voiceGuideSettings.voiceIndex;
        if (selectedIndex >= 0 && selectedIndex < voices.length) {
            utterance.voice = voices[selectedIndex];
        } else {
            const zhVoice = voices.find(v => v.lang.startsWith('zh') || v.lang.startsWith('cmn'));
            if (zhVoice) utterance.voice = zhVoice;
        }

        utterance.onend = () => {
            this.currentUtterance = null;
        };
        utterance.onerror = () => {
            this.currentUtterance = null;
        };

        this.currentUtterance = utterance;
        speechSynthesis.speak(utterance);
    }

    stopVoiceGuide() {
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
        this.currentUtterance = null;
    }

    setupRitualSection() {
        const noiseBtns = document.querySelectorAll('.noise-btn');
        noiseBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                noiseBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedNoise = btn.dataset.noise;
            });
        });

        document.getElementById('startRitual').addEventListener('click', () => {
            this.startRitual();
        });

        document.getElementById('stopRitual').addEventListener('click', () => {
            this.stopRitual();
        });

        document.getElementById('volumeSlider').addEventListener('input', (e) => {
            this.setVolume(e.target.value / 100);
        });
    }

    startRitual() {
        const minutes = parseInt(document.getElementById('countdownSelect').value);
        
        document.querySelector('.ritual-options').classList.add('hidden');
        document.querySelector('.ritual-animation').classList.add('hidden');
        document.getElementById('ritualTimer').classList.remove('hidden');

        const noiseHint = document.getElementById('noiseHint');
        const noiseTexts = {
            rain: '🌧️ 听着雨声，让思绪慢慢沉淀...',
            ocean: '🌊 海浪轻轻拍打着岸边，心也随之平静...',
            forest: '🌲 森林里的风声，让一切都慢下来...',
            fire: '🔥 篝火噼啪作响，温暖而安心...'
        };
        noiseHint.textContent = this.selectedNoise 
            ? noiseTexts[this.selectedNoise] 
            : '🌙 夜色温柔，好梦将至';

        if (this.selectedNoise) {
            this.startAmbientSound(this.selectedNoise);
        }

        if (minutes > 0) {
            this.startCountdown(minutes);
        } else {
            document.getElementById('timerMinutes').textContent = '--';
            document.getElementById('timerSeconds').textContent = '--';
        }
    }

    startCountdown(minutes) {
        let totalSeconds = minutes * 60;

        const updateDisplay = () => {
            const mins = Math.floor(totalSeconds / 60);
            const secs = totalSeconds % 60;
            document.getElementById('timerMinutes').textContent = mins.toString().padStart(2, '0');
            document.getElementById('timerSeconds').textContent = secs.toString().padStart(2, '0');
        };

        updateDisplay();

        this.ritualTimer = setInterval(() => {
            totalSeconds--;
            updateDisplay();

            if (totalSeconds <= 0) {
                if (this.ritualTimer) {
                    clearInterval(this.ritualTimer);
                    this.ritualTimer = null;
                }
                this.fadeScreen();
            }
        }, 1000);
    }

    stopRitual() {
        if (this.ritualTimer) {
            clearInterval(this.ritualTimer);
            this.ritualTimer = null;
        }

        this.stopAmbientSound();

        document.querySelector('.ritual-options').classList.remove('hidden');
        document.querySelector('.ritual-animation').classList.remove('hidden');
        document.getElementById('ritualTimer').classList.add('hidden');
    }

    fadeScreen() {
        this.fadeOutAmbientSound(8);

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #0a0a15 0%, #000 100%);
            opacity: 0;
            z-index: 9999;
            transition: opacity 10s ease;
            pointer-events: auto;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        `;
        overlay.innerHTML = '<span style="opacity: 0; transition: opacity 3s ease; color: #b0b8c8; font-size: 2rem; text-align: center; line-height: 1.8;">晚安 💤<br><span style="font-size: 1rem; color: #7a8599;">点击屏幕可关闭</span></span>';
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            overlay.style.opacity = '1';
        }, 100);

        setTimeout(() => {
            overlay.querySelector('span').style.opacity = '1';
        }, 10000);
        
        overlay.addEventListener('click', () => {
            this.stopAmbientSound();
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 1000);
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setupBackup() {
        document.getElementById('exportBackupBtn').addEventListener('click', () => this.exportBackup());
        document.getElementById('importBackupBtn').addEventListener('click', () => {
            document.getElementById('importBackupFile').click();
        });
        document.getElementById('importBackupFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            e.target.value = '';
            this.handleImportFile(file);
        });
    }

    exportBackup() {
        const hasData = this.thoughts.length > 0 || this.tomorrowItems.length > 0;
        if (!hasData) {
            this.showToast('暂无数据可导出');
            return;
        }

        const backup = {
            version: this.BACKUP_VERSION,
            appName: '睡前脑内清仓机',
            exportDate: new Date().toISOString(),
            data: {
                thoughts: JSON.parse(JSON.stringify(this.thoughts)),
                tomorrowItems: JSON.parse(JSON.stringify(this.tomorrowItems))
            }
        };

        const json = JSON.stringify(backup, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
        a.href = url;
        a.download = `睡前脑内清仓_备份_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this.showToast('备份文件已导出 💾');
    }

    handleImportFile(file) {
        if (!file.name.endsWith('.json')) {
            this.showToast('请选择 .json 格式的备份文件');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const backup = JSON.parse(e.target.result);
                this.validateBackup(backup);
                this.showImportDialog(backup);
            } catch (err) {
                if (err.message === 'INVALID_BACKUP') {
                    this.showToast('备份文件格式无效');
                } else {
                    this.showToast('文件解析失败，请检查文件格式');
                }
            }
        };
        reader.onerror = () => {
            this.showToast('文件读取失败');
        };
        reader.readAsText(file);
    }

    validateBackup(backup) {
        if (!backup || typeof backup !== 'object') {
            throw new Error('INVALID_BACKUP');
        }
        if (typeof backup.version !== 'number' || backup.version < 1) {
            throw new Error('INVALID_BACKUP');
        }
        if (!backup.data || typeof backup.data !== 'object') {
            throw new Error('INVALID_BACKUP');
        }
        if (!Array.isArray(backup.data.thoughts) || !Array.isArray(backup.data.tomorrowItems)) {
            throw new Error('INVALID_BACKUP');
        }
        if (backup.version > this.BACKUP_VERSION) {
            throw new Error('INVALID_BACKUP');
        }
    }

    migrateBackup(backup) {
        let migrated = JSON.parse(JSON.stringify(backup));
        if (migrated.version < this.BACKUP_VERSION) {
            if (migrated.version === 1) {
                migrated.data.thoughts = migrated.data.thoughts.map(t => ({
                    id: t.id || this.generateId(),
                    text: t.text || '',
                    category: t.category || 'todo',
                    createdAt: t.createdAt || new Date().toISOString()
                }));
                migrated.data.tomorrowItems = migrated.data.tomorrowItems.map(t => ({
                    id: t.id || this.generateId(),
                    text: t.text || '',
                    createdAt: t.createdAt || new Date().toISOString()
                }));
            }
            migrated.version = this.BACKUP_VERSION;
        }
        return migrated;
    }

    showImportDialog(backup) {
        const migrated = this.migrateBackup(backup);
        const thoughtCount = migrated.data.thoughts.length;
        const tomorrowCount = migrated.data.tomorrowItems.length;
        const exportDate = migrated.exportDate
            ? new Date(migrated.exportDate).toLocaleString('zh-CN')
            : '未知';

        const existing = document.getElementById('importDialog');
        if (existing) existing.remove();

        const dialog = document.createElement('div');
        dialog.id = 'importDialog';
        dialog.className = 'import-dialog-overlay';
        dialog.innerHTML = `
            <div class="import-dialog">
                <h3>📥 导入备份数据</h3>
                <div class="import-dialog-info">
                    <p><strong>备份时间：</strong>${exportDate}</p>
                    <p><strong>念头记录：</strong>${thoughtCount} 条</p>
                    <p><strong>明日盒子：</strong>${tomorrowCount} 条</p>
                    <p><strong>当前数据：</strong>念头 ${this.thoughts.length} 条，明日 ${this.tomorrowItems.length} 条</p>
                </div>
                <div class="import-dialog-strategy">
                    <p class="strategy-label">请选择导入方式：</p>
                    <label class="strategy-option">
                        <input type="radio" name="importStrategy" value="merge" checked>
                        <div class="strategy-detail">
                            <strong>🔀 合并</strong>
                            <span>将备份数据与当前数据合并，已有记录不会被覆盖，仅新增不存在的条目</span>
                        </div>
                    </label>
                    <label class="strategy-option">
                        <input type="radio" name="importStrategy" value="replace">
                        <div class="strategy-detail">
                            <strong>🔄 替换</strong>
                            <span>用备份数据完全替换当前数据，当前所有记录将被清除</span>
                        </div>
                    </label>
                </div>
                <div class="import-dialog-actions">
                    <button class="btn-secondary" id="importCancelBtn">取消</button>
                    <button class="btn-primary" id="importConfirmBtn">确认导入</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        const closeDialog = () => dialog.remove();

        dialog.querySelector('#importCancelBtn').addEventListener('click', closeDialog);

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) closeDialog();
        });

        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeDialog();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);

        dialog.querySelector('#importConfirmBtn').addEventListener('click', () => {
            const strategy = dialog.querySelector('input[name="importStrategy"]:checked').value;
            document.removeEventListener('keydown', handleEsc);
            closeDialog();

            if (strategy === 'merge') {
                this.mergeBackup(migrated);
            } else {
                this.showReplaceConfirmDialog(() => this.replaceBackup(migrated));
            }
        });
    }

    showReplaceConfirmDialog(onConfirm) {
        const dialog = document.createElement('div');
        dialog.id = 'replaceConfirmDialog';
        dialog.className = 'import-dialog-overlay';
        dialog.innerHTML = `
            <div class="confirm-dialog">
                <div class="confirm-icon">⚠️</div>
                <h3>确认替换数据？</h3>
                <p>替换操作会清除当前所有的念头记录和明日盒子内容，然后将备份数据完整恢复。此操作可以撤销。</p>
                <div class="confirm-dialog-actions">
                    <button class="btn-secondary" id="replaceCancelBtn">取消</button>
                    <button class="btn-primary danger" id="replaceConfirmBtn">确认替换</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        const closeDialog = () => dialog.remove();

        dialog.querySelector('#replaceCancelBtn').addEventListener('click', closeDialog);

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) closeDialog();
        });

        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeDialog();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);

        dialog.querySelector('#replaceConfirmBtn').addEventListener('click', () => {
            document.removeEventListener('keydown', handleEsc);
            closeDialog();
            onConfirm();
        });
    }

    mergeBackup(backup) {
        try {
            const validThoughts = backup.data.thoughts.filter(t => t && typeof t.text === 'string');
            const validTomorrowItems = backup.data.tomorrowItems.filter(t => t && typeof t.text === 'string');

            const invalidCount = (backup.data.thoughts.length - validThoughts.length) + 
                                 (backup.data.tomorrowItems.length - validTomorrowItems.length);

            this.recordState('导入备份数据（合并）');

            const existingThoughtIds = new Set(this.thoughts.map(t => t.id));
            const existingTomorrowIds = new Set(this.tomorrowItems.map(t => t.id));

            const newThoughts = validThoughts.filter(t => !existingThoughtIds.has(t.id));
            const newTomorrowItems = validTomorrowItems.filter(t => !existingTomorrowIds.has(t.id));

            const textKeyThought = (t) => t.text.trim() + '|' + t.category;
            const textKeyTomorrow = (t) => t.text.trim();

            const existingTextKeysThought = new Set(this.thoughts.map(textKeyThought));
            const existingTextKeysTomorrow = new Set(this.tomorrowItems.map(textKeyTomorrow));

            const dedupedThoughts = newThoughts.filter(t => t.text.trim() && !existingTextKeysThought.has(textKeyThought(t)));
            const dedupedTomorrowItems = newTomorrowItems.filter(t => t.text.trim() && !existingTextKeysTomorrow.has(textKeyTomorrow(t)));

            this.thoughts = this.thoughts.concat(dedupedThoughts);
            this.tomorrowItems = this.tomorrowItems.concat(dedupedTomorrowItems);

            this.saveToStorage('thoughts', this.thoughts);
            this.saveToStorage('tomorrowItems', this.tomorrowItems);
            this.buildSearchIndex();
            this.updateView();
            this.renderTomorrowList();
            this.renderBreatheList();
            this.updateInsights();
            this.updateUndoRedoUI();

            const total = dedupedThoughts.length + dedupedTomorrowItems.length;
            if (invalidCount > 0) {
                this.showToast(`导入成功：新增 ${total} 条，已忽略 ${invalidCount} 条无效数据 ⚠️`);
            } else if (total > 0) {
                this.showToast(`已合并导入 ${total} 条新记录 🔀`);
            } else {
                this.showToast('备份数据已全部存在，无新增记录');
            }
        } catch (e) {
            console.error(e);
            this.showToast('导入失败，备份数据格式有误');
        }
    }

    replaceBackup(backup) {
        try {
            const validThoughts = backup.data.thoughts.filter(t => t && typeof t.text === 'string');
            const validTomorrowItems = backup.data.tomorrowItems.filter(t => t && typeof t.text === 'string');

            const invalidCount = (backup.data.thoughts.length - validThoughts.length) + 
                                 (backup.data.tomorrowItems.length - validTomorrowItems.length);

            this.recordState('导入备份数据（替换）');

            this.thoughts = JSON.parse(JSON.stringify(validThoughts));
            this.tomorrowItems = JSON.parse(JSON.stringify(validTomorrowItems));

            this.saveToStorage('thoughts', this.thoughts);
            this.saveToStorage('tomorrowItems', this.tomorrowItems);
            this.buildSearchIndex();
            this.updateView();
            this.renderTomorrowList();
            this.renderBreatheList();
            this.updateInsights();
            this.updateUndoRedoUI();

            const total = this.thoughts.length + this.tomorrowItems.length;
            if (invalidCount > 0) {
                this.showToast(`替换成功：共 ${total} 条，已忽略 ${invalidCount} 条无效数据 ⚠️`);
            } else {
                this.showToast(`已替换导入 ${total} 条记录 🔄`);
            }
        } catch (e) {
            console.error(e);
            this.showToast('导入失败，备份数据格式有误');
        }
    }

    setupSearchSystem() {
        const searchInput = document.getElementById('searchInput');
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        const toggleFilterBtn = document.getElementById('toggleFilterBtn');
        const resetFiltersBtn = document.getElementById('resetFiltersBtn');

        searchInput.addEventListener('input', (e) => {
            this.debouncedSearch(e.target.value);
        });

        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            this.searchQuery = '';
            clearSearchBtn.style.display = 'none';
            this.updateView();
        });

        toggleFilterBtn.addEventListener('click', () => {
            const filterPanel = document.getElementById('filterPanel');
            const isVisible = filterPanel.style.display !== 'none';
            filterPanel.style.display = isVisible ? 'none' : 'block';
        });

        resetFiltersBtn.addEventListener('click', () => {
            this.resetAllFilters();
        });

        this.setupCategoryFilters();
        this.setupDateFilters();
        this.setupTimeSlotFilters();
        this.setupSortOptions();
    }

    setupCategoryFilters() {
        const checkboxes = document.querySelectorAll('#categoryFilters input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.filters.categories = Array.from(checkboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);
                this.updateView();
            });
        });
    }

    setupDateFilters() {
        const dateFrom = document.getElementById('dateFrom');
        const dateTo = document.getElementById('dateTo');
        const clearDateBtn = document.getElementById('clearDateBtn');
        const quickBtns = document.querySelectorAll('.quick-date-btn[data-days]');

        dateFrom.addEventListener('change', () => {
            this.filters.dateFrom = dateFrom.value || null;
            this.updateView();
        });

        dateTo.addEventListener('change', () => {
            this.filters.dateTo = dateTo.value || null;
            this.updateView();
        });

        clearDateBtn.addEventListener('click', () => {
            dateFrom.value = '';
            dateTo.value = '';
            this.filters.dateFrom = null;
            this.filters.dateTo = null;
            this.updateView();
        });

        quickBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const days = parseInt(btn.dataset.days);
                const today = new Date();
                const fromDate = new Date();
                fromDate.setDate(today.getDate() - days);
                
                dateFrom.value = this.formatDateForInput(fromDate);
                dateTo.value = this.formatDateForInput(today);
                this.filters.dateFrom = dateFrom.value;
                this.filters.dateTo = dateTo.value;
                this.updateView();
            });
        });
    }

    setupTimeSlotFilters() {
        const checkboxes = document.querySelectorAll('#timeSlotFilters input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.filters.timeSlots = Array.from(checkboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);
                this.updateView();
            });
        });
    }

    setupSortOptions() {
        const radios = document.querySelectorAll('input[name="sortBy"]');
        radios.forEach(radio => {
            radio.addEventListener('change', () => {
                this.filters.sortBy = radio.value;
                this.updateView();
            });
        });
    }

    formatDateForInput(date) {
        return date.toISOString().split('T')[0];
    }

    resetAllFilters() {
        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearchBtn').style.display = 'none';
        this.searchQuery = '';

        document.querySelectorAll('#categoryFilters input[type="checkbox"]').forEach(cb => cb.checked = true);
        this.filters.categories = ['todo', 'worry', 'idea'];

        document.getElementById('dateFrom').value = '';
        document.getElementById('dateTo').value = '';
        this.filters.dateFrom = null;
        this.filters.dateTo = null;

        document.querySelectorAll('#timeSlotFilters input[type="checkbox"]').forEach(cb => cb.checked = true);
        this.filters.timeSlots = ['morning', 'afternoon', 'evening', 'night'];

        document.querySelector('input[name="sortBy"][value="date-desc"]').checked = true;
        this.filters.sortBy = 'date-desc';

        this.updateView();
    }

    debouncedSearch(query) {
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }
        
        this.searchDebounceTimer = setTimeout(() => {
            this.searchQuery = query.trim().toLowerCase();
            const clearBtn = document.getElementById('clearSearchBtn');
            clearBtn.style.display = query ? 'block' : 'none';
            this.updateView();
        }, this.SEARCH_DEBOUNCE_MS);
    }

    buildSearchIndex() {
        this.searchIndex = new Map();
        
        this.thoughts.forEach(thought => {
            const tokens = this.tokenize(thought.text);
            tokens.forEach(token => {
                if (!this.searchIndex.has(token)) {
                    this.searchIndex.set(token, new Set());
                }
                this.searchIndex.get(token).add(thought.id);
            });
        });
    }

    tokenize(text) {
        const cleaned = text.toLowerCase()
            .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        const words = cleaned.split(/\s+/);
        const tokens = new Set();
        
        words.forEach(word => {
            if (word.length > 0) {
                tokens.add(word);
                for (let i = 1; i < word.length; i++) {
                    for (let j = i + 1; j <= word.length; j++) {
                        if (j - i >= 2) {
                            tokens.add(word.substring(i, j));
                        }
                    }
                }
            }
        });
        
        return Array.from(tokens);
    }

    searchThoughts(query) {
        if (!query) return this.thoughts;
        
        const queryTokens = this.tokenize(query);
        if (queryTokens.length === 0) return this.thoughts;
        
        const matchedIds = new Set();
        let firstToken = true;
        
        queryTokens.forEach(token => {
            if (this.searchIndex.has(token)) {
                const tokenIds = this.searchIndex.get(token);
                if (firstToken) {
                    tokenIds.forEach(id => matchedIds.add(id));
                    firstToken = false;
                } else {
                    tokenIds.forEach(id => {
                        if (matchedIds.has(id)) {
                            matchedIds.add(id);
                        }
                    });
                }
            }
        });

        const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        return this.thoughts.filter(t => 
            matchedIds.has(t.id) || regex.test(t.text)
        );
    }

    filterThoughts(thoughts) {
        return thoughts.filter(thought => {
            if (!this.filters.categories.includes(thought.category)) {
                return false;
            }

            const createdAt = new Date(thought.createdAt);
            
            if (this.filters.dateFrom) {
                const fromDate = new Date(this.filters.dateFrom);
                fromDate.setHours(0, 0, 0, 0);
                if (createdAt < fromDate) return false;
            }
            
            if (this.filters.dateTo) {
                const toDate = new Date(this.filters.dateTo);
                toDate.setHours(23, 59, 59, 999);
                if (createdAt > toDate) return false;
            }

            const hour = createdAt.getHours();
            let timeSlot;
            if (hour >= 6 && hour < 12) timeSlot = 'morning';
            else if (hour >= 12 && hour < 18) timeSlot = 'afternoon';
            else if (hour >= 18 && hour < 24) timeSlot = 'evening';
            else timeSlot = 'night';
            
            if (!this.filters.timeSlots.includes(timeSlot)) {
                return false;
            }

            return true;
        });
    }

    sortThoughts(thoughts) {
        const sorted = [...thoughts];
        const categoryOrder = { todo: 0, worry: 1, idea: 2 };
        
        switch (this.filters.sortBy) {
            case 'date-desc':
                sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case 'date-asc':
                sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                break;
            case 'category':
                sorted.sort((a, b) => {
                    const catDiff = categoryOrder[a.category] - categoryOrder[b.category];
                    if (catDiff !== 0) return catDiff;
                    return new Date(b.createdAt) - new Date(a.createdAt);
                });
                break;
        }
        
        return sorted;
    }

    highlightText(text, query) {
        if (!query) return this.escapeHtml(text);
        
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const escaped = this.escapeHtml(text);
        return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
    }

    getTimeSlotLabel(timeSlot) {
        const labels = {
            morning: '🌅 早晨',
            afternoon: '☀️ 下午',
            evening: '🌆 傍晚',
            night: '🌙 深夜'
        };
        return labels[timeSlot] || '';
    }

    getCategoryLabel(category) {
        const labels = {
            todo: '📋 待办',
            worry: '💭 担忧',
            idea: '💡 灵感'
        };
        return labels[category] || category;
    }

    formatDateTime(isoString) {
        const date = new Date(isoString);
        return date.toLocaleString('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    hasActiveFilters() {
        return this.searchQuery || 
               this.filters.categories.length < 3 ||
               this.filters.dateFrom ||
               this.filters.dateTo ||
               this.filters.timeSlots.length < 4;
    }

    updateView() {
        const normalView = document.getElementById('normalView');
        const searchResultsView = document.getElementById('searchResultsView');
        const resultsInfo = document.getElementById('searchResultsInfo');
        const resultsCount = document.getElementById('resultsCount');

        if (this.hasActiveFilters()) {
            let results = this.searchThoughts(this.searchQuery);
            results = this.filterThoughts(results);
            results = this.sortThoughts(results);

            normalView.style.display = 'none';
            searchResultsView.style.display = 'block';
            resultsInfo.style.display = 'flex';

            const queryText = this.searchQuery ? `「${this.searchQuery}」` : '';
            resultsCount.innerHTML = `找到 <strong>${results.length}</strong> 条记录 ${queryText}`;

            this.renderSearchResults(results);
        } else {
            normalView.style.display = 'grid';
            searchResultsView.style.display = 'none';
            resultsInfo.style.display = 'none';
            this.renderThoughts();
        }
    }

    renderSearchResults(results) {
        const listEl = document.getElementById('searchResultsList');
        
        if (results.length === 0) {
            listEl.innerHTML = '<div class="empty-state">没有找到匹配的记录</div>';
            return;
        }

        listEl.innerHTML = results.map(item => {
            const isEditing = this.editingThoughtId === item.id;
            const hasHistory = item.editHistory && item.editHistory.length > 1;
            const isHistoryExpanded = this.expandedHistoryIds && this.expandedHistoryIds.has(item.id);
            const highlightedText = this.highlightText(item.text, this.searchQuery);
            const createdAt = new Date(item.createdAt);
            const hour = createdAt.getHours();
            let timeSlot;
            if (hour >= 6 && hour < 12) timeSlot = 'morning';
            else if (hour >= 12 && hour < 18) timeSlot = 'afternoon';
            else if (hour >= 18 && hour < 24) timeSlot = 'evening';
            else timeSlot = 'night';

            if (isEditing) {
                return `
                    <div class="search-result-item editing">
                        <div class="result-meta">
                            <span class="result-category cat-${item.category}">${this.getCategoryLabel(item.category)}</span>
                            <span class="result-time">
                                <span class="result-time-slot">${this.getTimeSlotLabel(timeSlot)}</span>
                                <span class="result-date">${this.formatDateTime(item.createdAt)}</span>
                            </span>
                        </div>
                        <textarea 
                            class="edit-input search-edit-input" 
                            data-edit-id="${item.id}"
                            onkeydown="app.handleEditKeydown(event, '${item.id}')"
                        >${this.escapeHtml(item.text)}</textarea>
                        <div class="edit-actions">
                            <button onclick="app.saveEditThought('${item.id}', document.querySelector('[data-edit-id=\\'${item.id}\\']').value)" title="保存 (Enter)">✓ 保存</button>
                            <button onclick="app.cancelEditThought('${item.id}')" title="取消 (Esc)">✕ 取消</button>
                        </div>
                    </div>
                `;
            }

            return `
                <div class="search-result-item">
                    <div class="result-meta">
                        <span class="result-category cat-${item.category}">${this.getCategoryLabel(item.category)}</span>
                        <span class="result-time">
                            <span class="result-time-slot">${this.getTimeSlotLabel(timeSlot)}</span>
                            <span class="result-date">${this.formatDateTime(item.createdAt)}</span>
                        </span>
                    </div>
                    <div class="result-text" onclick="app.startEditThought('${item.id}')" title="点击编辑">${highlightedText}</div>
                    <div class="result-actions">
                        ${hasHistory ? `<button onclick="app.toggleHistory('${item.id}')" title="查看修改历史" class="history-btn ${isHistoryExpanded ? 'active' : ''}">📜</button>` : ''}
                        <button onclick="app.moveToTomorrow('${item.id}')" title="移到明天">🌅</button>
                        <button onclick="app.removeThought('${item.id}')" title="删除">✕</button>
                    </div>
                    ${isHistoryExpanded ? this.renderHistoryPanel(item) : ''}
                </div>
            `;
        }).join('');
    }

    addThought(text, category) {
        if (category === 'later') {
            this.recordState('添加到明日盒子');
            this.addToTomorrow(text);
            this.showToast('已保存到明日盒子 🌅');
        } else {
            const categoryNames = { todo: '待办', worry: '担忧', idea: '灵感' };
            this.recordState('添加' + (categoryNames[category] || '条目'));
            const now = new Date().toISOString();
            const thought = {
                id: this.generateId(),
                text,
                category,
                createdAt: now,
                editHistory: [{
                    text,
                    timestamp: now,
                    isOriginal: true
                }]
            };
            this.thoughts.push(thought);
            this.saveToStorage('thoughts', this.thoughts);
            this.buildSearchIndex();
            this.updateView();
            this.renderBreatheList();
            this.updateInsights();
        }
    }

    startEditThought(id) {
        const thought = this.thoughts.find(t => t.id === id);
        if (!thought) return;
        this.editingThoughtId = id;
        this.editOriginalText = thought.text;
        this.updateView();
        this.renderBreatheList();
        setTimeout(() => {
            const input = document.querySelector(`[data-edit-id="${id}"]`);
            if (input) {
                input.focus();
                input.select();
            }
        }, 50);
    }

    saveEditThought(id, newText) {
        const thought = this.thoughts.find(t => t.id === id);
        if (!thought) return;
        
        newText = newText.trim();
        if (!newText) {
            this.cancelEditThought(id);
            return;
        }
        
        if (newText === thought.text) {
            this.cancelEditThought(id);
            return;
        }
        
        this.recordState('编辑条目');
        
        if (!thought.editHistory) {
            thought.editHistory = [{
                text: thought.text,
                timestamp: thought.createdAt,
                isOriginal: true
            }];
        }
        
        thought.editHistory.push({
            text: newText,
            timestamp: new Date().toISOString(),
            isOriginal: false
        });
        
        thought.text = newText;
        this.editingThoughtId = null;
        this.editOriginalText = null;
        
        this.saveToStorage('thoughts', this.thoughts);
        this.buildSearchIndex();
        this.updateView();
        this.renderBreatheList();
        this.updateInsights();
        this.showToast('已保存修改 ✓');
    }

    cancelEditThought(id) {
        this.editingThoughtId = null;
        this.editOriginalText = null;
        this.updateView();
        this.renderBreatheList();
    }

    toggleHistory(id) {
        if (!this.expandedHistoryIds) {
            this.expandedHistoryIds = new Set();
        }
        if (this.expandedHistoryIds.has(id)) {
            this.expandedHistoryIds.delete(id);
        } else {
            this.expandedHistoryIds.add(id);
        }
        this.updateView();
        this.renderBreatheList();
    }

    _removeThoughtFromData(id) {
        this.thoughts = this.thoughts.filter(t => t.id !== id);
        this.saveToStorage('thoughts', this.thoughts);
        this.buildSearchIndex();
        this.updateView();
        this.renderBreatheList();
        this.updateInsights();
    }

    setupInsights() {
        this.currentTimeRange = 'week';
        this.insightsDateFrom = null;
        this.insightsDateTo = null;
        this.resizeTimeout = null;
        this.chartAnimFrames = {};
        this.tooltipEl = null;
        this._createTooltip();

        const timeRangeBtns = document.querySelectorAll('.time-range-btn');
        timeRangeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                timeRangeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTimeRange = btn.dataset.range;

                const customRange = document.getElementById('customDateRange');
                if (this.currentTimeRange === 'custom') {
                    customRange.style.display = 'flex';
                } else {
                    customRange.style.display = 'none';
                    this.updateInsights();
                }
            });
        });

        const dateFrom = document.getElementById('insightsDateFrom');
        const dateTo = document.getElementById('insightsDateTo');

        dateFrom.addEventListener('change', () => {
            this.insightsDateFrom = dateFrom.value || null;
            if (this.insightsDateFrom && this.insightsDateTo) {
                this.updateInsights();
            }
        });

        dateTo.addEventListener('change', () => {
            this.insightsDateTo = dateTo.value || null;
            if (this.insightsDateFrom && this.insightsDateTo) {
                this.updateInsights();
            }
        });

        window.addEventListener('resize', () => {
            if (this.resizeTimeout) {
                clearTimeout(this.resizeTimeout);
            }
            this.resizeTimeout = setTimeout(() => {
                this.updateInsights();
            }, 200);
        });
    }

    _createTooltip() {
        if (this.tooltipEl) return;
        this.tooltipEl = document.createElement('div');
        this.tooltipEl.className = 'chart-tooltip';
        this.tooltipEl.style.cssText = `
            position: absolute;
            background: rgba(30, 30, 58, 0.95);
            border: 1px solid rgba(102, 126, 234, 0.4);
            border-radius: 8px;
            padding: 8px 12px;
            color: #ccd6f6;
            font-size: 0.82rem;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.15s ease;
            z-index: 100;
            white-space: nowrap;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            backdrop-filter: blur(8px);
        `;
        document.body.appendChild(this.tooltipEl);
    }

    _showTooltip(x, y, html) {
        if (!this.tooltipEl) return;
        this.tooltipEl.innerHTML = html;
        this.tooltipEl.style.opacity = '1';
        const rect = this.tooltipEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = x + 12;
        let top = y - 10;
        if (left + rect.width > vw - 10) left = x - rect.width - 12;
        if (top + rect.height > vh - 10) top = y - rect.height - 10;
        if (top < 10) top = 10;
        this.tooltipEl.style.left = left + 'px';
        this.tooltipEl.style.top = top + 'px';
    }

    _hideTooltip() {
        if (this.tooltipEl) {
            this.tooltipEl.style.opacity = '0';
        }
    }

    _cancelChartAnim(key) {
        if (this.chartAnimFrames[key]) {
            cancelAnimationFrame(this.chartAnimFrames[key]);
            this.chartAnimFrames[key] = null;
        }
    }

    _animateChart(key, drawFn, duration = 600) {
        this._cancelChartAnim(key);
        const start = performance.now();
        const animate = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            drawFn(eased);
            if (progress < 1) {
                this.chartAnimFrames[key] = requestAnimationFrame(animate);
            }
        };
        this.chartAnimFrames[key] = requestAnimationFrame(animate);
    }

    _animateValue(el, targetVal, duration = 600, isFloat = false) {
        const startVal = parseFloat(el.textContent) || 0;
        const diff = targetVal - startVal;
        if (Math.abs(diff) < 0.01) {
            el.textContent = isFloat ? targetVal.toFixed(1) : targetVal;
            return;
        }
        const startTime = performance.now();
        const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = startVal + diff * eased;
            el.textContent = isFloat ? current.toFixed(1) : Math.round(current);
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
    }

    getInsightsDateRange() {
        const now = new Date();
        let from = new Date();
        let to = new Date();

        switch (this.currentTimeRange) {
            case 'week':
                from.setDate(now.getDate() - 7);
                to = now;
                break;
            case 'month':
                from.setDate(now.getDate() - 30);
                to = now;
                break;
            case 'custom':
                if (this.insightsDateFrom && this.insightsDateTo) {
                    from = new Date(this.insightsDateFrom);
                    to = new Date(this.insightsDateTo);
                    to.setHours(23, 59, 59, 999);
                }
                break;
        }

        return { from, to };
    }

    getFilteredThoughtsForInsights() {
        const { from, to } = this.getInsightsDateRange();
        return this.thoughts.filter(t => {
            const date = new Date(t.createdAt);
            return date >= from && date <= to;
        });
    }

    calculateInsightsStats() {
        const thoughts = this.getFilteredThoughtsForInsights();
        const { from, to } = this.getInsightsDateRange();

        const totalEntries = thoughts.length;
        
        const dateSet = new Set();
        thoughts.forEach(t => {
            const date = new Date(t.createdAt).toDateString();
            dateSet.add(date);
        });
        const activeDays = dateSet.size;

        const daysDiff = Math.max(1, Math.ceil((to - from) / (1000 * 60 * 60 * 24)));
        const avgPerDay = (totalEntries / daysDiff).toFixed(1);

        const allDates = [...new Set(this.thoughts.map(t => new Date(t.createdAt).toDateString()))];
        allDates.sort((a, b) => new Date(b) - new Date(a));
        
        let streakDays = 0;
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        
        if (allDates.includes(today) || allDates.includes(yesterday)) {
            let checkDate = allDates.includes(today) ? new Date() : new Date(Date.now() - 86400000);
            while (allDates.includes(checkDate.toDateString())) {
                streakDays++;
                checkDate.setDate(checkDate.getDate() - 1);
            }
        }

        return { totalEntries, streakDays, activeDays, avgPerDay };
    }

    calculateTrendData() {
        const thoughts = this.getFilteredThoughtsForInsights();
        const { from, to } = this.getInsightsDateRange();
        
        const dailyData = [];
        const currentDate = new Date(from);
        
        while (currentDate <= to) {
            const dateStr = currentDate.toDateString();
            const count = thoughts.filter(t => new Date(t.createdAt).toDateString() === dateStr).length;
            dailyData.push({
                date: new Date(currentDate),
                count
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return dailyData;
    }

    calculateCategoryData() {
        const thoughts = this.getFilteredThoughtsForInsights();
        
        const categories = {
            todo: { count: 0, color: '#4ecdc4', label: '待办', icon: '📋' },
            worry: { count: 0, color: '#ff6b6b', label: '担忧', icon: '💭' },
            idea: { count: 0, color: '#ffd93d', label: '灵感', icon: '💡' }
        };

        thoughts.forEach(t => {
            if (categories[t.category]) {
                categories[t.category].count++;
            }
        });

        const total = thoughts.length;
        Object.keys(categories).forEach(key => {
            categories[key].percentage = total > 0 ? (categories[key].count / total * 100).toFixed(1) : 0;
        });

        return categories;
    }

    calculateTimeSlotData() {
        const thoughts = this.getFilteredThoughtsForInsights();

        const slots = new Array(24).fill(0);
        thoughts.forEach(t => {
            const hour = new Date(t.createdAt).getHours();
            slots[hour]++;
        });

        return slots;
    }

    calculateTimePeriodData() {
        const thoughts = this.getFilteredThoughtsForInsights();
        const periods = [
            { key: 'morning', label: '早晨', icon: '🌅', range: '6-12', color: '#ffd93d', hours: [6,7,8,9,10,11], count: 0 },
            { key: 'afternoon', label: '下午', icon: '☀️', range: '12-18', color: '#ff6b6b', hours: [12,13,14,15,16,17], count: 0 },
            { key: 'evening', label: '傍晚', icon: '🌆', range: '18-24', color: '#667eea', hours: [18,19,20,21,22,23], count: 0 },
            { key: 'night', label: '深夜', icon: '🌙', range: '0-6', color: '#764ba2', hours: [0,1,2,3,4,5], count: 0 }
        ];

        thoughts.forEach(t => {
            const hour = new Date(t.createdAt).getHours();
            for (const p of periods) {
                if (p.hours.includes(hour)) {
                    p.count++;
                    break;
                }
            }
        });

        return periods;
    }

    calculateWeekdayData() {
        const thoughts = this.getFilteredThoughtsForInsights();
        
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const data = weekdays.map((label, index) => ({
            label,
            count: thoughts.filter(t => new Date(t.createdAt).getDay() === index).length
        }));

        return data;
    }

    calculateWordFrequency() {
        const thoughts = this.getFilteredThoughtsForInsights();
        const wordCount = new Map();
        const stopWords = new Set(['的', '了', '是', '我', '有', '在', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这']);

        thoughts.forEach(t => {
            const text = t.text.replace(/[^\w\u4e00-\u9fa5\s]/g, ' ');
            const words = text.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]+/g) || [];
            
            words.forEach(word => {
                if (!stopWords.has(word.toLowerCase()) && word.length > 1) {
                    wordCount.set(word, (wordCount.get(word) || 0) + 1);
                }
            });
        });

        return [...wordCount.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30);
    }

    generateSuggestions() {
        const suggestions = [];
        const thoughts = this.getFilteredThoughtsForInsights();
        const categories = this.calculateCategoryData();
        const timeSlots = this.calculateTimeSlotData();
        const periods = this.calculateTimePeriodData();
        const weekdayData = this.calculateWeekdayData();
        const stats = this.calculateInsightsStats();

        if (thoughts.length < 3) {
            suggestions.push({
                type: 'habit',
                icon: '🌱',
                text: '刚开始记录思绪，继续坚持就能看到更多洞察啦！试试每天睡前记录几条想法~'
            });
            return suggestions;
        }

        if (categories.worry.count > 0 && categories.worry.percentage > 30) {
            suggestions.push({
                type: 'worry',
                icon: '🧘',
                text: `近期<strong>担忧类</strong>条目占比<strong>${categories.worry.percentage}%</strong>，偏多一些。建议多做几次<strong>呼吸练习</strong>，让心情平静下来。`
            });
        }

        if (categories.idea.count > 0 && categories.idea.percentage > 40) {
            suggestions.push({
                type: 'idea',
                icon: '💡',
                text: `你最近有很多<strong>灵感</strong>迸发（占比${categories.idea.percentage}%）！这些都是宝贵的财富，建议定期整理灵感清单。`
            });
        }

        if (categories.todo.count > 0 && categories.todo.percentage > 50) {
            suggestions.push({
                type: 'todo',
                icon: '📋',
                text: `<strong>待办事项</strong>较多（占比${categories.todo.percentage}%），建议优先处理重要事项，适当使用<strong>明日盒子</strong>减轻心理负担。`
            });
        }

        if (categories.worry.count > 0 && categories.idea.count > 0) {
            const ratio = (categories.worry.count / categories.idea.count).toFixed(1);
            if (ratio > 2) {
                suggestions.push({
                    type: 'worry',
                    icon: '⚖️',
                    text: `担忧与灵感的比例约为<strong>${ratio}:1</strong>，担忧明显偏多。试着把一些担忧转化为待办行动，或者用<strong>呼吸练习</strong>释放压力。`
                });
            } else if (ratio < 0.5) {
                suggestions.push({
                    type: 'idea',
                    icon: '✨',
                    text: `灵感远多于担忧，你正处于<strong>创造力旺盛</strong>的阶段！这是记录和实现想法的最佳时机。`
                });
            }
        }

        const nightCount = timeSlots.slice(22).reduce((a, b) => a + b, 0) + timeSlots.slice(0, 5).reduce((a, b) => a + b, 0);
        const nightPercentage = thoughts.length > 0 ? (nightCount / thoughts.length * 100).toFixed(1) : 0;
        if (nightPercentage > 40) {
            suggestions.push({
                type: 'habit',
                icon: '🌙',
                text: `你在<strong>深夜时段</strong>记录较多（占比${nightPercentage}%）。睡前思绪丰富是正常的，但也要注意保证充足睡眠哦~`
            });
        }

        const morningCount = timeSlots.slice(6, 12).reduce((a, b) => a + b, 0);
        const morningPercentage = thoughts.length > 0 ? (morningCount / thoughts.length * 100).toFixed(1) : 0;
        if (morningPercentage > 35) {
            suggestions.push({
                type: 'habit',
                icon: '🌅',
                text: `你习惯在<strong>早晨</strong>记录思绪（占比${morningPercentage}%），这是个很棒的习惯！清晨的思维最清晰。`
            });
        }

        const eveningCount = timeSlots.slice(18, 24).reduce((a, b) => a + b, 0);
        const eveningPercentage = thoughts.length > 0 ? (eveningCount / thoughts.length * 100).toFixed(1) : 0;
        if (eveningPercentage > 50) {
            suggestions.push({
                type: 'habit',
                icon: '🌆',
                text: `你大部分思绪记录在<strong>傍晚到深夜</strong>（占比${eveningPercentage}%）。这是大脑最活跃的时段，建议在睡前一小时完成记录，然后开启<strong>入睡仪式</strong>。`
            });
        }

        const maxWeekday = weekdayData.reduce((max, d) => d.count > max.count ? d : max, weekdayData[0]);
        const minWeekday = weekdayData.reduce((min, d) => d.count < min.count ? d : min, weekdayData[0]);
        if (maxWeekday.count > 0 && minWeekday.count >= 0 && maxWeekday.count > minWeekday.count * 2) {
            suggestions.push({
                type: 'habit',
                icon: '📅',
                text: `你在<strong>周${maxWeekday.label}</strong>记录最多（${maxWeekday.count}条），而周${minWeekday.label}最少。了解自己的节奏有助于合理安排~`
            });
        }

        const activePeriod = periods.reduce((max, p) => p.count > max.count ? p : max, periods[0]);
        if (activePeriod.count > 0 && thoughts.length >= 5) {
            suggestions.push({
                type: 'habit',
                icon: activePeriod.icon,
                text: `你最活跃的时段是<strong>${activePeriod.label}（${activePeriod.range}时）</strong>，共${activePeriod.count}条记录。`
            });
        }

        if (stats.streakDays >= 7) {
            suggestions.push({
                type: 'habit',
                icon: '🏆',
                text: `太厉害了！你已经<strong>连续记录${stats.streakDays}天</strong>了！坚持记录是了解自己的最佳方式，继续加油~`
            });
        } else if (stats.streakDays >= 3) {
            suggestions.push({
                type: 'habit',
                icon: '🔥',
                text: `已经连续记录<strong>${stats.streakDays}天</strong>了，保持这个势头！连续7天就能解锁成就哦~`
            });
        }

        if (stats.totalEntries > 0) {
            const avgStr = stats.avgPerDay;
            if (parseFloat(avgStr) >= 3) {
                suggestions.push({
                    type: 'habit',
                    icon: '📝',
                    text: `日均记录<strong>${avgStr}条</strong>，你是一个善于反思的人！记得适时清空大脑，用<strong>呼吸练习</strong>放松~`
                });
            }
        }

        return suggestions;
    }

    drawLineChart(canvas, data) {
        const width = canvas.parentElement.clientWidth;
        const height = canvas.parentElement.clientHeight;
        const padding = { top: 20, right: 20, bottom: 35, left: 40 };

        canvas.width = width * 2;
        canvas.height = height * 2;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const maxValue = Math.max(...data.map(d => d.count), 1);
        const stepCount = data.length > 1 ? data.length - 1 : 1;

        const points = data.map((d, i) => ({
            x: padding.left + (chartWidth * i / stepCount),
            y: padding.top + chartHeight - (chartHeight * d.count / maxValue),
            count: d.count,
            date: d.date
        }));

        const draw = (progress) => {
            const ctx = canvas.getContext('2d');
            ctx.setTransform(2, 0, 0, 2, 0, 0);
            ctx.clearRect(0, 0, width, height);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const y = padding.top + (chartHeight * i / 4);
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();
            }

            ctx.fillStyle = '#8892b0';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'right';
            for (let i = 0; i <= 4; i++) {
                const value = Math.round(maxValue * (4 - i) / 4);
                const y = padding.top + (chartHeight * i / 4);
                ctx.fillText(value.toString(), padding.left - 8, y + 3);
            }

            if (points.length === 0) return;

            const visibleCount = Math.max(1, Math.ceil(points.length * progress));
            const visiblePoints = points.slice(0, visibleCount);
            const lastVisibleY = padding.top + chartHeight - (chartHeight * 0 / maxValue);

            const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
            gradient.addColorStop(0, 'rgba(102, 126, 234, 0.25)');
            gradient.addColorStop(1, 'rgba(102, 126, 234, 0)');

            ctx.beginPath();
            ctx.moveTo(visiblePoints[0].x, height - padding.bottom);
            ctx.lineTo(visiblePoints[0].x, visiblePoints[0].y);

            if (visiblePoints.length === 1) {
                ctx.lineTo(visiblePoints[0].x, height - padding.bottom);
            } else {
                for (let i = 1; i < visiblePoints.length; i++) {
                    const prev = visiblePoints[i - 1];
                    const curr = visiblePoints[i];
                    const cpx = (prev.x + curr.x) / 2;
                    ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
                }
                ctx.lineTo(visiblePoints[visiblePoints.length - 1].x, height - padding.bottom);
            }

            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();

            ctx.beginPath();
            ctx.strokeStyle = '#667eea';
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            ctx.moveTo(visiblePoints[0].x, visiblePoints[0].y);
            for (let i = 1; i < visiblePoints.length; i++) {
                const prev = visiblePoints[i - 1];
                const curr = visiblePoints[i];
                const cpx = (prev.x + curr.x) / 2;
                ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
            }
            ctx.stroke();

            visiblePoints.forEach((p, i) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#667eea';
                ctx.fill();
                ctx.strokeStyle = '#1a1a2e';
                ctx.lineWidth = 2;
                ctx.stroke();

                if (p.count > 0 && progress >= 0.8) {
                    ctx.fillStyle = '#a8b2d1';
                    ctx.font = '9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(p.count.toString(), p.x, p.y - 10);
                }
            });

            ctx.fillStyle = '#8892b0';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            const labelStep = Math.ceil(data.length / 7);
            data.forEach((d, i) => {
                if (i % labelStep === 0 || i === data.length - 1) {
                    const x = padding.left + (chartWidth * i / stepCount);
                    const dateStr = `${d.date.getMonth() + 1}/${d.date.getDate()}`;
                    ctx.fillText(dateStr, x, height - padding.bottom + 15);
                }
            });
        };

        this._animateChart('trend', draw, 700);

        const tooltipData = points;
        canvas.onmousemove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            let closest = null;
            let minDist = Infinity;
            tooltipData.forEach(p => {
                const dist = Math.abs(p.x - mx);
                if (dist < minDist) {
                    minDist = dist;
                    closest = p;
                }
            });

            if (closest && minDist < 30) {
                const dateStr = `${closest.date.getMonth() + 1}月${closest.date.getDate()}日`;
                this._showTooltip(e.clientX, e.clientY,
                    `<div style="font-weight:500;margin-bottom:2px">${dateStr}</div><div style="color:#667eea">${closest.count} 条记录</div>`);
            } else {
                this._hideTooltip();
            }
        };
        canvas.onmouseleave = () => this._hideTooltip();
    }

    drawDonutChart(canvas, categories) {
        const size = Math.min(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight);

        canvas.width = size * 2;
        canvas.height = size * 2;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';

        const centerX = size / 2;
        const centerY = size / 2;
        const outerRadius = size / 2 - 20;
        const innerRadius = outerRadius * 0.6;
        const gapAngle = 0.03;

        const data = Object.values(categories).filter(c => c.count > 0);
        const total = data.reduce((sum, c) => sum + c.count, 0);

        const draw = (progress) => {
            const ctx = canvas.getContext('2d');
            ctx.setTransform(2, 0, 0, 2, 0, 0);
            ctx.clearRect(0, 0, size, size);

            if (total === 0) {
                ctx.beginPath();
                ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
                ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2, true);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.fill();

                ctx.fillStyle = '#8892b0';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('暂无数据', centerX, centerY + 4);
                return;
            }

            const totalAngle = Math.PI * 2 * progress;
            let startAngle = -Math.PI / 2;

            data.forEach((category, idx) => {
                const sliceAngle = (category.count / total) * totalAngle;
                if (sliceAngle <= 0) return;

                const actualGap = data.length > 1 ? gapAngle : 0;
                const drawStart = startAngle + actualGap / 2;
                const drawEnd = startAngle + sliceAngle - actualGap / 2;

                if (drawEnd > drawStart) {
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, outerRadius, drawStart, drawEnd);
                    ctx.arc(centerX, centerY, innerRadius, drawEnd, drawStart, true);
                    ctx.closePath();

                    const glowGradient = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, outerRadius);
                    glowGradient.addColorStop(0, category.color + 'cc');
                    glowGradient.addColorStop(1, category.color);
                    ctx.fillStyle = glowGradient;
                    ctx.fill();

                    if (progress >= 0.9 && sliceAngle > 0.3) {
                        const midAngle = startAngle + sliceAngle / 2;
                        const labelRadius = (outerRadius + innerRadius) / 2;
                        const lx = centerX + Math.cos(midAngle) * labelRadius;
                        const ly = centerY + Math.sin(midAngle) * labelRadius;
                        const pct = (category.count / total * 100).toFixed(0);

                        ctx.fillStyle = '#fff';
                        ctx.font = 'bold 10px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(pct + '%', lx, ly);
                    }
                }

                startAngle += sliceAngle;
            });

            ctx.fillStyle = '#ccd6f6';
            ctx.font = 'bold 20px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const displayTotal = Math.round(total * progress);
            ctx.fillText(displayTotal.toString(), centerX, centerY - 6);

            ctx.fillStyle = '#8892b0';
            ctx.font = '11px sans-serif';
            ctx.fillText('总记录', centerX, centerY + 14);
        };

        this._animateChart('donut', draw, 800);

        canvas.onmousemove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left);
            const my = (e.clientY - rect.top);
            const dx = mx - centerX;
            const dy = my - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist >= innerRadius && dist <= outerRadius && total > 0) {
                let angle = Math.atan2(dy, dx);
                if (angle < -Math.PI / 2) angle += Math.PI * 2;
                const normalizedAngle = angle + Math.PI / 2;
                const positiveAngle = normalizedAngle < 0 ? normalizedAngle + Math.PI * 2 : normalizedAngle;

                let cumAngle = 0;
                for (const cat of data) {
                    const sliceAngle = (cat.count / total) * Math.PI * 2;
                    if (positiveAngle >= cumAngle && positiveAngle < cumAngle + sliceAngle) {
                        const pct = (cat.count / total * 100).toFixed(1);
                        this._showTooltip(e.clientX, e.clientY,
                            `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px"><span style="width:8px;height:8px;border-radius:2px;background:${cat.color};display:inline-block"></span><strong>${cat.icon} ${cat.label}</strong></div><div>${cat.count} 条 (${pct}%)</div>`);
                        return;
                    }
                    cumAngle += sliceAngle;
                }
            }
            this._hideTooltip();
        };
        canvas.onmouseleave = () => this._hideTooltip();
    }

    drawBarChart(canvas, data, labels = null, barColors = null) {
        const width = canvas.parentElement.clientWidth;
        const height = canvas.parentElement.clientHeight;
        const padding = { top: 20, right: 20, bottom: 30, left: 40 };

        canvas.width = width * 2;
        canvas.height = height * 2;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        const values = Array.isArray(data) ? data : Object.values(data);
        const maxValue = Math.max(...values, 1);
        const barCount = values.length;
        const barWidth = (chartWidth / barCount) * 0.65;
        const gap = (chartWidth / barCount) * 0.35;

        const barPositions = values.map((value, i) => ({
            x: padding.left + (chartWidth / barCount) * i + gap / 2,
            y: padding.top + chartHeight - (value / maxValue) * chartHeight,
            width: barWidth,
            height: (value / maxValue) * chartHeight,
            value,
            label: labels ? labels[i] : i.toString().padStart(2, '0')
        }));

        const draw = (progress) => {
            const ctx = canvas.getContext('2d');
            ctx.setTransform(2, 0, 0, 2, 0, 0);
            ctx.clearRect(0, 0, width, height);

            for (let i = 0; i <= 4; i++) {
                const y = padding.top + (chartHeight * i / 4);
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            ctx.fillStyle = '#8892b0';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'right';
            for (let i = 0; i <= 4; i++) {
                const value = Math.round(maxValue * (4 - i) / 4);
                const y = padding.top + (chartHeight * i / 4);
                ctx.fillText(value.toString(), padding.left - 8, y + 3);
            }

            barPositions.forEach((bar, i) => {
                const animatedHeight = bar.height * progress;
                const y = padding.top + chartHeight - animatedHeight;

                const barGradient = ctx.createLinearGradient(bar.x, y, bar.x, y + animatedHeight);
                if (barColors && barColors[i]) {
                    barGradient.addColorStop(0, barColors[i]);
                    barGradient.addColorStop(1, barColors[i] + '88');
                } else {
                    barGradient.addColorStop(0, 'rgba(102, 126, 234, 0.9)');
                    barGradient.addColorStop(1, 'rgba(118, 75, 162, 0.7)');
                }

                ctx.fillStyle = barGradient;
                const r = Math.min(4, barWidth / 4);
                if (animatedHeight > r * 2) {
                    ctx.beginPath();
                    ctx.moveTo(bar.x + r, y);
                    ctx.lineTo(bar.x + barWidth - r, y);
                    ctx.quadraticCurveTo(bar.x + barWidth, y, bar.x + barWidth, y + r);
                    ctx.lineTo(bar.x + barWidth, y + animatedHeight);
                    ctx.lineTo(bar.x, y + animatedHeight);
                    ctx.lineTo(bar.x, y + r);
                    ctx.quadraticCurveTo(bar.x, y, bar.x + r, y);
                    ctx.closePath();
                    ctx.fill();
                } else if (animatedHeight > 0) {
                    ctx.fillRect(bar.x, y, barWidth, animatedHeight);
                }

                if (bar.value > 0 && progress >= 0.7) {
                    ctx.fillStyle = '#a8b2d1';
                    ctx.font = '9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(bar.value.toString(), bar.x + barWidth / 2, y - 6);
                }
            });

            ctx.fillStyle = '#8892b0';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            for (let i = 0; i < barCount; i++) {
                const x = padding.left + (chartWidth / barCount) * i + gap / 2 + barWidth / 2;
                ctx.fillText(barPositions[i].label, x, height - padding.bottom + 14);
            }
        };

        this._animateChart('bar-' + (labels ? labels.join('') : 'default'), draw, 600);

        canvas.onmousemove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            const hit = barPositions.find(bar =>
                mx >= bar.x && mx <= bar.x + bar.width &&
                my >= bar.y && my <= bar.y + bar.height
            );

            if (hit && hit.value > 0) {
                this._showTooltip(e.clientX, e.clientY,
                    `<div style="font-weight:500">${hit.label}</div><div style="color:#667eea">${hit.value} 条记录</div>`);
            } else {
                this._hideTooltip();
            }
        };
        canvas.onmouseleave = () => this._hideTooltip();
    }

    drawTimePeriodChart(canvas, periods) {
        const width = canvas.parentElement.clientWidth;
        const height = canvas.parentElement.clientHeight;
        const padding = { top: 25, right: 20, bottom: 40, left: 40 };

        canvas.width = width * 2;
        canvas.height = height * 2;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const maxValue = Math.max(...periods.map(p => p.count), 1);
        const barCount = periods.length;
        const barWidth = (chartWidth / barCount) * 0.55;
        const gap = (chartWidth / barCount) * 0.45;

        const barPositions = periods.map((p, i) => ({
            x: padding.left + (chartWidth / barCount) * i + gap / 2,
            y: padding.top + chartHeight - (p.count / maxValue) * chartHeight,
            width: barWidth,
            height: (p.count / maxValue) * chartHeight,
            value: p.count,
            color: p.color,
            icon: p.icon,
            label: p.label,
            range: p.range
        }));

        const draw = (progress) => {
            const ctx = canvas.getContext('2d');
            ctx.setTransform(2, 0, 0, 2, 0, 0);
            ctx.clearRect(0, 0, width, height);

            for (let i = 0; i <= 4; i++) {
                const y = padding.top + (chartHeight * i / 4);
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            ctx.fillStyle = '#8892b0';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'right';
            for (let i = 0; i <= 4; i++) {
                const value = Math.round(maxValue * (4 - i) / 4);
                const y = padding.top + (chartHeight * i / 4);
                ctx.fillText(value.toString(), padding.left - 8, y + 3);
            }

            barPositions.forEach((bar) => {
                const animatedHeight = bar.height * progress;
                const y = padding.top + chartHeight - animatedHeight;

                const barGradient = ctx.createLinearGradient(bar.x, y, bar.x, y + animatedHeight);
                barGradient.addColorStop(0, bar.color);
                barGradient.addColorStop(1, bar.color + '66');

                ctx.fillStyle = barGradient;
                const r = Math.min(6, barWidth / 4);
                if (animatedHeight > r * 2) {
                    ctx.beginPath();
                    ctx.moveTo(bar.x + r, y);
                    ctx.lineTo(bar.x + barWidth - r, y);
                    ctx.quadraticCurveTo(bar.x + barWidth, y, bar.x + barWidth, y + r);
                    ctx.lineTo(bar.x + barWidth, y + animatedHeight);
                    ctx.lineTo(bar.x, y + animatedHeight);
                    ctx.lineTo(bar.x, y + r);
                    ctx.quadraticCurveTo(bar.x, y, bar.x + r, y);
                    ctx.closePath();
                    ctx.fill();
                } else if (animatedHeight > 0) {
                    ctx.fillRect(bar.x, y, barWidth, animatedHeight);
                }

                if (bar.value > 0 && progress >= 0.7) {
                    ctx.fillStyle = '#ccd6f6';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(bar.value.toString(), bar.x + barWidth / 2, y - 8);
                }
            });

            ctx.textAlign = 'center';
            barPositions.forEach((bar) => {
                const cx = bar.x + barWidth / 2;

                ctx.fillStyle = '#ccd6f6';
                ctx.font = '13px sans-serif';
                ctx.fillText(bar.icon, cx, height - padding.bottom + 14);

                ctx.fillStyle = '#8892b0';
                ctx.font = '9px sans-serif';
                ctx.fillText(bar.label, cx, height - padding.bottom + 28);

                ctx.fillStyle = '#5a6a8a';
                ctx.font = '8px sans-serif';
                ctx.fillText(bar.range + '时', cx, height - padding.bottom + 40);
            });
        };

        this._animateChart('timePeriod', draw, 700);

        canvas.onmousemove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            const hit = barPositions.find(bar =>
                mx >= bar.x && mx <= bar.x + bar.width &&
                my >= bar.y && my <= bar.y + bar.height
            );

            if (hit) {
                const total = periods.reduce((s, p) => s + p.count, 0);
                const pct = total > 0 ? (hit.value / total * 100).toFixed(1) : 0;
                this._showTooltip(e.clientX, e.clientY,
                    `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">${hit.icon} <strong>${hit.label} (${hit.range}时)</strong></div><div>${hit.value} 条记录 (${pct}%)</div>`);
            } else {
                this._hideTooltip();
            }
        };
        canvas.onmouseleave = () => this._hideTooltip();
    }

    renderCategoryLegend(categories) {
        const legendEl = document.getElementById('categoryLegend');
        const total = Object.values(categories).reduce((s, c) => s + c.count, 0);
        legendEl.innerHTML = Object.values(categories).map(cat => {
            const pct = total > 0 ? (cat.count / total * 100).toFixed(1) : 0;
            return `
            <div class="legend-item" style="animation: slideIn 0.3s ease ${Math.random() * 0.2}s both">
                <span class="legend-color" style="background: ${cat.color}; box-shadow: 0 0 6px ${cat.color}66"></span>
                <span>${cat.icon} ${cat.label}</span>
                <span style="color:#ccd6f6;font-weight:500;margin-left:4px">${cat.count}</span>
                <span style="color:#5a6a8a;margin-left:2px">(${pct}%)</span>
            </div>`;
        }).join('');
    }

    renderWordCloud(words) {
        const container = document.getElementById('wordCloud');

        if (words.length === 0) {
            container.innerHTML = '<div class="empty-state">记录更多内容生成词云</div>';
            return;
        }

        const maxCount = Math.max(...words.map(w => w[1]));
        const colors = ['#667eea', '#764ba2', '#4ecdc4', '#ff6b6b', '#ffd93d', '#a8e6cf', '#88d8b0', '#fcb69f'];

        container.innerHTML = words.map(([word, count], index) => {
            const sizeLevel = Math.min(5, Math.ceil((count / maxCount) * 5));
            const color = colors[index % colors.length];
            const bgColor = color + '18';
            const delay = (index * 0.03).toFixed(2);

            return `<span class="word-item word-size-${sizeLevel}" style="background: ${bgColor}; color: ${color}; border: 1px solid ${color}33; animation: wordFadeIn 0.4s ease ${delay}s both">${word}<span style="font-size:0.7em;opacity:0.5;margin-left:2px">${count}</span></span>`;
        }).join('');
    }

    renderSuggestions(suggestions) {
        const container = document.getElementById('suggestionsList');

        if (suggestions.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无足够数据生成洞察</div>';
            return;
        }

        container.innerHTML = suggestions.map((s, i) => `
            <div class="suggestion-item type-${s.type}" style="animation: slideIn 0.3s ease ${(i * 0.08).toFixed(2)}s both">
                <span class="suggestion-icon">${s.icon}</span>
                <div class="suggestion-text">${s.text}</div>
            </div>
        `).join('');
    }

    updateInsights() {
        if (this.currentTab !== 'insights') return;

        const stats = this.calculateInsightsStats();
        this._animateValue(document.getElementById('totalEntries'), stats.totalEntries, 600);
        this._animateValue(document.getElementById('streakDays'), stats.streakDays, 600);
        this._animateValue(document.getElementById('activeDays'), stats.activeDays, 600);
        this._animateValue(document.getElementById('avgPerDay'), parseFloat(stats.avgPerDay), 600, true);

        const trendData = this.calculateTrendData();
        const trendCanvas = document.getElementById('trendChart');
        if (trendCanvas) {
            this.drawLineChart(trendCanvas, trendData);
        }

        const categoryData = this.calculateCategoryData();
        const categoryCanvas = document.getElementById('categoryChart');
        if (categoryCanvas) {
            this.drawDonutChart(categoryCanvas, categoryData);
        }
        this.renderCategoryLegend(categoryData);

        const timePeriodData = this.calculateTimePeriodData();
        const timeCanvas = document.getElementById('timeChart');
        if (timeCanvas) {
            this.drawTimePeriodChart(timeCanvas, timePeriodData);
        }

        const weekdayData = this.calculateWeekdayData();
        const weekdayCanvas = document.getElementById('weekdayChart');
        if (weekdayCanvas) {
            const weekdayColors = ['#667eea', '#764ba2', '#4ecdc4', '#ff6b6b', '#ffd93d', '#a8e6cf', '#fcb69f'];
            this.drawBarChart(weekdayCanvas, weekdayData.map(d => d.count), weekdayData.map(d => '周' + d.label), weekdayColors);
        }

        const words = this.calculateWordFrequency();
        this.renderWordCloud(words);

        const suggestions = this.generateSuggestions();
        this.renderSuggestions(suggestions);
    }

    setupReminderSystem() {
        this.setupBroadcastChannel();
        this.updateNotificationStatusUI();
        this.loadReminderSettingsToUI();
        this.setupReminderEventListeners();
        this.startReminderChecker();

        if (window.location.search.includes('fromNotification=true')) {
            setTimeout(() => this.showReadyOverlay(), 500);
        }
    }

    setupBroadcastChannel() {
        if ('BroadcastChannel' in window) {
            this.broadcastChannel = new BroadcastChannel('brainDumpReminderChannel');
            
            this.broadcastChannel.onmessage = (event) => {
                const { type, data } = event.data;
                
                switch (type) {
                    case 'REMINDER_TRIGGERED':
                        if (!document.hasFocus()) {
                            this.showInAppNotification(data.title, data.message);
                        }
                        break;
                    case 'SETTINGS_UPDATED':
                        this.reminderSettings = { ...this.reminderSettings, ...data };
                        this.saveToStorage('reminderSettings', this.reminderSettings);
                        this.loadReminderSettingsToUI();
                        break;
                    case 'READY_OVERLAY_TRIGGERED':
                        this.showReadyOverlay();
                        break;
                }
            };
        }
    }

    broadcastMessage(type, data) {
        if (this.broadcastChannel) {
            this.broadcastChannel.postMessage({ type, data });
        }
    }

    async requestNotificationPermission() {
        if (!('Notification' in window)) {
            this.showToast('当前浏览器不支持通知功能');
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            this.updateNotificationStatusUI();
            
            if (permission === 'granted') {
                this.showToast('通知权限已开启 🔔');
                this.sendTestNotification();
            } else if (permission === 'denied') {
                this.showToast('通知权限被拒绝，请在浏览器设置中开启');
            }
        } catch (error) {
            console.error('请求通知权限失败:', error);
            this.showToast('请求通知权限失败');
        }
    }

    getNotificationPermission() {
        if (!('Notification' in window)) return 'unsupported';
        return Notification.permission;
    }

    updateNotificationStatusUI() {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.getElementById('statusText');
        const requestBtn = document.getElementById('requestPermissionBtn');
        
        const permission = this.getNotificationPermission();
        
        statusDot.classList.remove('status-granted', 'status-denied');
        
        switch (permission) {
            case 'granted':
                statusDot.classList.add('status-granted');
                statusText.textContent = '已授权';
                requestBtn.style.display = 'none';
                break;
            case 'denied':
                statusDot.classList.add('status-denied');
                statusText.textContent = '已拒绝';
                requestBtn.textContent = '重新申请';
                requestBtn.style.display = 'block';
                break;
            case 'unsupported':
                statusDot.classList.add('status-denied');
                statusText.textContent = '不支持';
                requestBtn.style.display = 'none';
                break;
            default:
                statusText.textContent = '未授权';
                requestBtn.textContent = '申请通知权限';
                requestBtn.style.display = 'block';
        }
    }

    loadReminderSettingsToUI() {
        const enableCheckbox = document.getElementById('enableReminder');
        const timeInput = document.getElementById('reminderTime');
        const titleInput = document.getElementById('reminderTitle');
        const messageInput = document.getElementById('reminderMessage');
        const soundCheckbox = document.getElementById('enableSound');
        const repeatRadio = document.querySelector(`input[name="repeatMode"][value="${this.reminderSettings.repeatMode}"]`);

        if (enableCheckbox) enableCheckbox.checked = this.reminderSettings.enabled;
        if (timeInput) timeInput.value = this.reminderSettings.time;
        if (titleInput) titleInput.value = this.reminderSettings.title;
        if (messageInput) messageInput.value = this.reminderSettings.message;
        if (soundCheckbox) soundCheckbox.checked = this.reminderSettings.sound;
        if (repeatRadio) repeatRadio.checked = true;

        this.updatePreview();
        this.updateNextReminderDisplay();
    }

    setupReminderEventListeners() {
        const requestBtn = document.getElementById('requestPermissionBtn');
        if (requestBtn) {
            requestBtn.addEventListener('click', () => this.requestNotificationPermission());
        }

        const enableCheckbox = document.getElementById('enableReminder');
        if (enableCheckbox) {
            enableCheckbox.addEventListener('change', (e) => {
                this.reminderSettings.enabled = e.target.checked;
                this.saveReminderSettings();
            });
        }

        const timeInput = document.getElementById('reminderTime');
        if (timeInput) {
            timeInput.addEventListener('change', (e) => {
                this.reminderSettings.time = e.target.value;
                this.saveReminderSettings();
            });
        }

        const repeatRadios = document.querySelectorAll('input[name="repeatMode"]');
        repeatRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.reminderSettings.repeatMode = e.target.value;
                this.saveReminderSettings();
            });
        });

        const titleInput = document.getElementById('reminderTitle');
        if (titleInput) {
            titleInput.addEventListener('input', (e) => {
                this.reminderSettings.title = e.target.value;
                this.updatePreview();
                this.saveReminderSettings();
            });
        }

        const messageInput = document.getElementById('reminderMessage');
        if (messageInput) {
            messageInput.addEventListener('input', (e) => {
                this.reminderSettings.message = e.target.value;
                this.updatePreview();
                this.saveReminderSettings();
            });
        }

        const soundCheckbox = document.getElementById('enableSound');
        if (soundCheckbox) {
            soundCheckbox.addEventListener('change', (e) => {
                this.reminderSettings.sound = e.target.checked;
                this.saveReminderSettings();
            });
        }

        const testBtn = document.getElementById('testNotificationBtn');
        if (testBtn) {
            testBtn.addEventListener('click', () => this.sendTestNotification());
        }
    }

    saveReminderSettings() {
        this.saveToStorage('reminderSettings', this.reminderSettings);
        this.broadcastMessage('SETTINGS_UPDATED', this.reminderSettings);
        this.updateNextReminderDisplay();
        this.startReminderChecker();
    }

    updatePreview() {
        const previewTitle = document.getElementById('previewTitle');
        const previewMessage = document.getElementById('previewMessage');
        
        if (previewTitle) previewTitle.textContent = this.reminderSettings.title || '该准备睡觉了';
        if (previewMessage) previewMessage.textContent = this.reminderSettings.message || '放下手机，开始睡前整理吧';
    }

    startReminderChecker() {
        if (this.reminderCheckInterval) {
            clearInterval(this.reminderCheckInterval);
            this.reminderCheckInterval = null;
        }

        if (!this.reminderSettings.enabled) return;

        this.checkReminder();
        
        this.reminderCheckInterval = setInterval(() => {
            this.checkReminder();
        }, 30000);
    }

    checkReminder() {
        if (!this.reminderSettings.enabled) return;

        const now = new Date();
        const [hours, minutes] = this.reminderSettings.time.split(':').map(Number);
        
        if (this.reminderSettings.repeatMode === 'weekdays') {
            const day = now.getDay();
            if (day === 0 || day === 6) return;
        }

        const todayStr = now.toDateString();
        if (this.lastReminderDate === todayStr) return;

        if (now.getHours() === hours && now.getMinutes() >= minutes && now.getMinutes() < minutes + 2) {
            this.triggerReminder();
            this.lastReminderDate = todayStr;
        }
    }

    triggerReminder() {
        const { title, message, sound } = this.reminderSettings;

        if (sound) {
            this.playReminderSound();
        }

        const permission = this.getNotificationPermission();
        
        if (permission === 'granted') {
            this.sendSystemNotification(title, message);
        } else {
            this.showInAppNotification(title, message);
        }

        this.broadcastMessage('REMINDER_TRIGGERED', { title, message });
    }

    playReminderSound() {
        try {
            const ctx = this.initAudioContext();
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, ctx.currentTime);
            oscillator.frequency.setValueAtTime(600, ctx.currentTime + 0.15);
            oscillator.frequency.setValueAtTime(800, ctx.currentTime + 0.3);
            
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialDecayTo?.(0.01, ctx.currentTime + 0.5) || 
                gainNode.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.5);
        } catch (e) {
            console.log('播放提醒音效失败');
        }
    }

    sendSystemNotification(title, message) {
        if (this.getNotificationPermission() !== 'granted') return;

        const notification = new Notification(title, {
            body: message,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌙</text></svg>',
            badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌙</text></svg>',
            tag: 'bedtime-reminder',
            renotify: true,
            requireInteraction: true,
            silent: true
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
            this.showReadyOverlay();
        };

        setTimeout(() => notification.close(), 30000);
    }

    sendTestNotification() {
        const { title, message, sound } = this.reminderSettings;
        
        if (sound) {
            this.playReminderSound();
        }

        const permission = this.getNotificationPermission();
        
        if (permission === 'granted') {
            const testTitle = '🔔 测试通知 - ' + title;
            const testMessage = message + ' (这是测试通知)';
            this.sendSystemNotification(testTitle, testMessage);
            this.showToast('测试通知已发送');
        } else {
            this.showInAppNotification(title + ' (测试)', message);
            this.showToast('浏览器通知未授权，使用页面内通知');
        }
    }

    showInAppNotification(title, message) {
        const existing = document.querySelector('.in-app-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = 'in-app-notification';
        notification.innerHTML = `
            <div class="in-app-notification-header">
                <div class="in-app-notification-icon">🌙</div>
                <div class="in-app-notification-title">${this.escapeHtml(title)}</div>
                <button class="in-app-notification-close">✕</button>
            </div>
            <div class="in-app-notification-body">${this.escapeHtml(message)}</div>
            <div class="in-app-notification-actions">
                <button class="btn-secondary" id="inAppRemindLater">稍后</button>
                <button class="btn-primary" id="inAppStartNow">开始整理</button>
            </div>
        `;

        document.body.appendChild(notification);

        notification.querySelector('.in-app-notification-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeInAppNotification(notification);
        });

        notification.querySelector('#inAppStartNow').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeInAppNotification(notification);
            this.showReadyOverlay();
        });

        notification.querySelector('#inAppRemindLater').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeInAppNotification(notification);
            this.showToast('将在5分钟后再次提醒');
            setTimeout(() => this.showInAppNotification(title, message), 5 * 60 * 1000);
        });

        notification.addEventListener('click', () => {
            this.closeInAppNotification(notification);
            this.showReadyOverlay();
        });

        setTimeout(() => {
            if (document.body.contains(notification)) {
                this.closeInAppNotification(notification);
            }
        }, 60000);
    }

    closeInAppNotification(notification) {
        notification.classList.add('closing');
        setTimeout(() => {
            if (document.body.contains(notification)) {
                notification.remove();
            }
        }, 300);
    }

    getNextReminderTime() {
        if (!this.reminderSettings.enabled) return null;

        const now = new Date();
        const [hours, minutes] = this.reminderSettings.time.split(':').map(Number);
        
        let nextDate = new Date(now);
        nextDate.setHours(hours, minutes, 0, 0);

        if (nextDate <= now) {
            nextDate.setDate(nextDate.getDate() + 1);
        }

        if (this.reminderSettings.repeatMode === 'weekdays') {
            while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
                nextDate.setDate(nextDate.getDate() + 1);
            }
        }

        return nextDate;
    }

    updateNextReminderDisplay() {
        const infoEl = document.getElementById('nextReminderInfo');
        const timeEl = document.getElementById('nextReminderTime');
        
        if (!this.reminderSettings.enabled) {
            if (infoEl) infoEl.style.display = 'none';
            return;
        }

        const nextTime = this.getNextReminderTime();
        if (!nextTime) {
            if (infoEl) infoEl.style.display = 'none';
            return;
        }

        const now = new Date();
        const diffHours = Math.floor((nextTime - now) / (1000 * 60 * 60));
        const diffMinutes = Math.floor(((nextTime - now) % (1000 * 60 * 60)) / (1000 * 60));

        let displayText;
        if (diffHours < 24) {
            displayText = `${nextTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} (${diffHours > 0 ? diffHours + '小时' : ''}${diffMinutes}分钟后)`;
        } else {
            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            displayText = `${weekdays[nextTime.getDay()]} ${nextTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
        }

        if (timeEl) timeEl.textContent = displayText;
        if (infoEl) infoEl.style.display = 'flex';
    }

    showReadyOverlay() {
        let overlay = document.getElementById('readyOverlay');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'readyOverlay';
            overlay.className = 'ready-overlay';
            overlay.innerHTML = `
                <div class="ready-content">
                    <div class="ready-moon">🌙</div>
                    <h1 class="ready-title">准备入睡了吗？</h1>
                    <p class="ready-message">放下手机，让我们一起开始睡前整理，给大脑一个轻松的夜晚</p>
                    <div class="ready-steps">
                        <div class="ready-step">
                            <div class="ready-step-icon">📝</div>
                            <div class="ready-step-text">记录想法</div>
                        </div>
                        <div class="ready-step">
                            <div class="ready-step-icon">🧘</div>
                            <div class="ready-step-text">放松心情</div>
                        </div>
                        <div class="ready-step">
                            <div class="ready-step-icon">😴</div>
                            <div class="ready-step-text">安心入睡</div>
                        </div>
                    </div>
                    <button class="ready-btn">开始入睡仪式</button>
                </div>
            `;
            document.body.appendChild(overlay);

            overlay.querySelector('.ready-btn').addEventListener('click', () => {
                this.hideReadyOverlay();
                this.switchTab('ritual');
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.hideReadyOverlay();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && overlay.classList.contains('active')) {
                    this.hideReadyOverlay();
                }
            });
        }

        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });

        this.broadcastMessage('READY_OVERLAY_TRIGGERED', {});
    }

    hideReadyOverlay() {
        const overlay = document.getElementById('readyOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.remove();
                }
            }, 800);
        }
    }
}

const app = new BrainDumpApp();