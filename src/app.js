import { eventBus } from './core/EventBus.js';
import { escapeHtml, formatDateTime, formatDateForInput, getTimeSlot, getTimeSlotLabel, getCategoryLabel, downloadJson, copyToClipboard, animateValue } from './core/utils.js';
import { ThoughtCollection } from './models/ThoughtCollection.js?v=20260610';
import { TomorrowBox } from './models/TomorrowBox.js?v=20260610';
import { audioService } from './services/AudioService.js';
import { searchService } from './services/SearchService.js';
import { backupService } from './services/BackupService.js';
import { voiceGuideService } from './services/VoiceGuideService.js';
import { BreathingService } from './services/BreathingService.js';
import { reminderService } from './services/ReminderService.js';
import { undoRedoManager } from './features/UndoRedoManager.js';
import { ritualTimer } from './features/RitualTimer.js';
import { insightsAnalyzer } from './features/InsightsAnalyzer.js';
import { chartRenderer } from './ui/ChartRenderer.js';
import { onboardingGuide } from './features/OnboardingGuide.js';

class BrainDumpApp {
    constructor() {
        this.thoughtCollection = new ThoughtCollection();
        this.tomorrowBox = new TomorrowBox();
        this.breathingService = new BreathingService(voiceGuideService);
        
        this.currentTab = 'jot';
        this.lastSelectedCategory = 'todo';
        this.editingThoughtId = null;
        this.expandedHistoryIds = new Set();
        
        this.isBatchMode = false;
        this.selectedThoughtIds = new Set();
        
        this.init();
    }

    init() {
        undoRedoManager.registerProvider('thoughts', this.thoughtCollection);
        undoRedoManager.registerProvider('tomorrow', this.tomorrowBox);
        undoRedoManager.init();

        searchService.buildIndex(this.thoughtCollection.getAll().map(t => t.toJSON()));
        insightsAnalyzer.setThoughts(this.thoughtCollection.getAll().map(t => t.toJSON()));

        this.setupEventListeners();
        this.setupUI();
        
        this.renderThoughts();
        this.renderTomorrowList();
        this.renderBreatheList();
        
        voiceGuideService.init();
        this.updateBreathingModeUI();

        this.setupOnboardingGuide();
        
        eventBus.on('history:undo', (data) => {
            this.showToast('已撤销: ' + data.description);
            searchService.buildIndex(this.thoughtCollection.getAll().map(t => t.toJSON()));
            insightsAnalyzer.setThoughts(this.thoughtCollection.getAll().map(t => t.toJSON()));
            this.cleanupSelectedIds();
            this.updateView();
            this.renderBreatheList();
            this.renderTomorrowList();
        });

        eventBus.on('history:redo', (data) => {
            this.showToast('已重做: ' + data.description);
            searchService.buildIndex(this.thoughtCollection.getAll().map(t => t.toJSON()));
            insightsAnalyzer.setThoughts(this.thoughtCollection.getAll().map(t => t.toJSON()));
            this.cleanupSelectedIds();
            this.updateView();
            this.renderBreatheList();
            this.renderTomorrowList();
        });

        eventBus.on('ritual:timerUpdate', (data) => {
            document.getElementById('timerMinutes').textContent = data.minutes;
            document.getElementById('timerSeconds').textContent = data.seconds;
        });

        eventBus.on('breathing:countdown', (data) => {
            const display = document.getElementById('phaseTimerValue');
            if (display) display.textContent = data.remaining;
        });

        eventBus.on('breathing:phase', (data) => {
            this.updateBreathingUI(data.phase);
        });

        eventBus.on('breathing:stopped', (data) => {
            this.stopBreathingUI();
        });
    }

    setupOnboardingGuide() {
        onboardingGuide.init();

        eventBus.on('onboarding:switchTab', (tabName) => {
            this.switchTab(tabName);
        });

        eventBus.on('onboarding:completed', () => {
            this.showToast('引导已完成，祝你好梦 🌙');
        });

        eventBus.on('onboarding:later', () => {
            this.showToast('好的，稍后再看 ✨');
        });

        const helpBtn = document.getElementById('showHelpBtn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                this.startOnboarding();
            });
        }

        setTimeout(() => {
            if (onboardingGuide.shouldShowOnboarding()) {
                this.startOnboarding();
            }
        }, 800);
    }

    startOnboarding() {
        onboardingGuide.start();
    }

    setupEventListeners() {
        this.setupTabs();
        this.setupThoughtInput();
        this.setupBreatheSection();
        this.setupTomorrowSection();
        this.setupRitualSection();
        this.setupBackup();
        this.setupSearchSystem();
        this.setupInsights();
        this.setupReminderSystem();
        this.setupBatchOperations();
    }

    setupUI() {
        const defaultBtn = document.querySelector('.cat-btn[data-category="todo"]');
        if (defaultBtn) defaultBtn.classList.add('active');
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
        
        if (tabName !== 'jot' && this.isBatchMode) {
            this.toggleBatchMode(false);
        }
        
        if (tabName === 'insights') {
            setTimeout(() => this.updateInsights(), 100);
        }
    }

    setupThoughtInput() {
        const catBtns = document.querySelectorAll('.cat-btn');
        
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

    addThought(text, category) {
        if (category === 'later') {
            undoRedoManager.takeSnapshot('添加到明日盒子');
            this.tomorrowBox.add(text);
            this.showToast('已保存到明日盒子 🌅');
        } else {
            const categoryNames = { todo: '待办', worry: '担忧', idea: '灵感' };
            undoRedoManager.takeSnapshot('添加' + (categoryNames[category] || '条目'));
            this.thoughtCollection.add(text, category);
            searchService.buildIndex(this.thoughtCollection.getAll().map(t => t.toJSON()));
            insightsAnalyzer.setThoughts(this.thoughtCollection.getAll().map(t => t.toJSON()));
        }
        this.updateView();
        this.renderBreatheList();
    }

    removeThought(id) {
        undoRedoManager.takeSnapshot('删除条目');
        this.thoughtCollection.remove(id);
        searchService.buildIndex(this.thoughtCollection.getAll().map(t => t.toJSON()));
        insightsAnalyzer.setThoughts(this.thoughtCollection.getAll().map(t => t.toJSON()));
        
        if (this.isBatchMode && this.selectedThoughtIds.has(id)) {
            this.selectedThoughtIds.delete(id);
            this.updateSelectedCount();
        }
        
        this.updateView();
        this.renderBreatheList();
    }

    moveToTomorrow(id) {
        const thought = this.thoughtCollection.getById(id);
        if (thought) {
            undoRedoManager.takeSnapshot('移动到明日盒子');
            this.tomorrowBox.add(thought.text);
            this.thoughtCollection.remove(id);
            searchService.buildIndex(this.thoughtCollection.getAll().map(t => t.toJSON()));
            insightsAnalyzer.setThoughts(this.thoughtCollection.getAll().map(t => t.toJSON()));
            
            if (this.isBatchMode && this.selectedThoughtIds.has(id)) {
                this.selectedThoughtIds.delete(id);
                this.updateSelectedCount();
            }
            
            this.updateView();
            this.renderBreatheList();
            this.renderTomorrowList();
        }
    }

    startEditThought(id) {
        this.editingThoughtId = id;
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
        const thought = this.thoughtCollection.getById(id);
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
        
        undoRedoManager.takeSnapshot('编辑条目');
        this.thoughtCollection.update(id, newText);
        this.editingThoughtId = null;
        
        searchService.buildIndex(this.thoughtCollection.getAll().map(t => t.toJSON()));
        insightsAnalyzer.setThoughts(this.thoughtCollection.getAll().map(t => t.toJSON()));
        
        this.updateView();
        this.renderBreatheList();
        this.showToast('已保存修改 ✓');
    }

    cancelEditThought(id) {
        this.editingThoughtId = null;
        this.updateView();
        this.renderBreatheList();
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

    toggleHistory(id) {
        if (this.expandedHistoryIds.has(id)) {
            this.expandedHistoryIds.delete(id);
        } else {
            this.expandedHistoryIds.add(id);
        }
        this.updateView();
        this.renderBreatheList();
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
                                <span class="history-time">${formatDateTime(h.timestamp)}</span>
                            </div>
                            <div class="history-text">${escapeHtml(h.text)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderThoughts() {
        const categories = ['todo', 'worry', 'idea'];
        const thoughts = this.thoughtCollection.getAll();
        
        categories.forEach(cat => {
            const listEl = document.getElementById(`${cat}List`);
            const items = thoughts.filter(t => t.category === cat);
            
            if (items.length === 0) {
                listEl.innerHTML = '<div class="empty-state">暂无内容</div>';
                return;
            }

            listEl.innerHTML = items.map(item => {
                const isEditing = this.editingThoughtId === item.id;
                const hasHistory = item.editHistory && item.editHistory.length > 1;
                const isHistoryExpanded = this.expandedHistoryIds.has(item.id);
                const isSelected = this.selectedThoughtIds.has(item.id);

                if (isEditing) {
                    return `
                        <div class="thought-item editing">
                            ${this.isBatchMode ? `<div class="batch-checkbox-placeholder"></div>` : ''}
                            <textarea 
                                class="edit-input" 
                                data-edit-id="${item.id}"
                                onkeydown="window.app.handleEditKeydown(event, '${item.id}')"
                            >${escapeHtml(item.text)}</textarea>
                            <div class="edit-actions">
                                <button onclick="window.app.saveEditThought('${item.id}', document.querySelector('[data-edit-id=\\'${item.id}\\']').value)" title="保存 (Enter)">✓</button>
                                <button onclick="window.app.cancelEditThought('${item.id}')" title="取消 (Esc)">✕</button>
                            </div>
                        </div>
                    `;
                }

                return `
                    <div class="thought-item ${isSelected ? 'selected' : ''}" data-thought-id="${item.id}">
                        ${this.isBatchMode ? `
                            <div class="batch-checkbox ${isSelected ? 'checked' : ''}" data-thought-id="${item.id}">
                                <span class="checkbox-icon">${isSelected ? '✓' : ''}</span>
                            </div>
                        ` : ''}
                        <span class="text" onclick="window.app.startEditThought('${item.id}')" title="点击编辑">${escapeHtml(item.text)}</span>
                        <div class="actions">
                            ${hasHistory ? `<button onclick="window.app.toggleHistory('${item.id}')" title="查看修改历史" class="history-btn ${isHistoryExpanded ? 'active' : ''}">📜</button>` : ''}
                            <button onclick="window.app.moveToTomorrow('${item.id}')" title="移到明天">🌅</button>
                            <button onclick="window.app.removeThought('${item.id}')" title="删除">✕</button>
                        </div>
                        ${isHistoryExpanded ? this.renderHistoryPanel(item) : ''}
                    </div>
                `;
            }).join('');
        });
    }

    renderTomorrowList() {
        const listEl = document.getElementById('tomorrowList');
        const items = this.tomorrowBox.getAll();
        
        if (items.length === 0) {
            listEl.innerHTML = '<div class="empty-state">把事情交给明天，现在好好休息吧</div>';
            return;
        }

        listEl.innerHTML = items.map(item => `
            <div class="tomorrow-item">
                <span class="text">${escapeHtml(item.text)}</span>
                <button onclick="window.app.removeFromTomorrow('${item.id}')" title="删除">✕</button>
            </div>
        `).join('');
    }

    removeFromTomorrow(id) {
        undoRedoManager.takeSnapshot('删除明日条目');
        this.tomorrowBox.remove(id);
        this.renderTomorrowList();
    }

    clearTomorrow() {
        if (confirm('确定要清空明日盒子吗？')) {
            undoRedoManager.takeSnapshot('清空明日盒子');
            this.tomorrowBox.clear();
            this.renderTomorrowList();
        }
    }

    exportTomorrow() {
        if (this.tomorrowBox.count() === 0) {
            alert('明日盒子是空的');
            return;
        }
        
        const text = this.tomorrowBox.exportText();
        
        copyToClipboard(text).then(() => {
            alert('已复制到剪贴板');
        }).catch(() => {
            const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `明日清单_${dateStr}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    setupTomorrowSection() {
        document.getElementById('clearTomorrow').addEventListener('click', () => this.clearTomorrow());
        document.getElementById('exportTomorrow').addEventListener('click', () => this.exportTomorrow());
    }

    renderBreatheList() {
        const listEl = document.getElementById('breatheList');
        const allThoughts = this.thoughtCollection.getAll();
        
        if (allThoughts.length === 0) {
            listEl.innerHTML = '<div class="empty-state">先去记录一些思绪吧</div>';
            return;
        }

        listEl.innerHTML = allThoughts.map(item => `
            <div class="breathe-item" data-id="${item.id}">
                ${escapeHtml(item.text)}
            </div>
        `).join('');
    }

    setupBreatheSection() {
        document.getElementById('startBreathe').addEventListener('click', () => {
            if (this.breathingService.isBreathingActive()) {
                this.breathingService.stop();
            } else {
                if (this.thoughtCollection.count() === 0) {
                    alert('先去记录一些思绪吧');
                    return;
                }
                this.startBreathing();
            }
        });

        this.setupBreathingModes();
        this.setupPhaseConfig();
    }

    setupBreathingModes() {
        const modeBtns = document.querySelectorAll('.breathe-mode-btn');
        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.breathingService.isBreathingActive()) return;
                modeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.breathingService.setMode(btn.dataset.mode);
                this.updateBreathingModeUI();
            });
        });
    }

    updateBreathingModeUI() {
        const mode = this.breathingService.getCurrentMode();
        const isCustom = this.breathingService.currentMode === 'custom';

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

        const hold2Item = document.querySelector('.phase-config-item[data-phase="hold2"]');
        if (hold2Item) {
            const labelEl = hold2Item.querySelector('label');
            if (this.breathingService.currentMode === 'box') {
                labelEl.textContent = '保持';
            } else {
                labelEl.textContent = '放松';
            }
        }
    }

    setupPhaseConfig() {
        document.querySelectorAll('.phase-adjust-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.breathingService.isBreathingActive()) return;
                if (this.breathingService.currentMode !== 'custom') return;

                const phase = btn.dataset.phase;
                const action = btn.dataset.action;
                const delta = action === 'increase' ? 1 : -1;
                const current = this.breathingService.getCurrentMode()[phase];
                
                this.breathingService.setCustomPhase(phase, current + delta);
                this.updateBreathingModeUI();
            });
        });
    }

    startBreathing() {
        const breatheCircle = document.getElementById('breatheCircle');
        const breatheText = document.getElementById('breatheText');
        const breatheInstruction = document.getElementById('breatheInstruction');
        const phaseTimerEl = document.getElementById('breathePhaseTimer');
        const startBtn = document.getElementById('startBreathe');

        startBtn.textContent = '停止练习';
        phaseTimerEl.style.display = 'flex';

        breatheCircle.classList.add('active');
        breatheInstruction.textContent = this.breathingService.getInstructionText();

        let itemIndex = 0;
        const processedIds = [];

        this.breathingService.start((phase, cycleCount) => {
            const items = document.querySelectorAll('.breathe-item');
            
            if (cycleCount % 2 === 0 && phase.key === 'inhale' && itemIndex < items.length) {
                const currentItem = items[itemIndex];
                if (currentItem) {
                    currentItem.classList.add('fading');
                    const id = currentItem.dataset.id;
                    processedIds.push(id);
                    itemIndex++;
                }
            }

            if (itemIndex >= items.length && phase.key === 'inhale' && cycleCount >= 2) {
                setTimeout(() => {
                    if (processedIds.length > 0) {
                        undoRedoManager.takeSnapshot('呼吸练习清理');
                        processedIds.forEach(id => {
                            this.thoughtCollection.remove(id);
                        });
                        searchService.buildIndex(this.thoughtCollection.getAll().map(t => t.toJSON()));
                        insightsAnalyzer.setThoughts(this.thoughtCollection.getAll().map(t => t.toJSON()));
                        this.updateView();
                        this.renderBreatheList();
                    }
                    this.breathingService.stop();
                }, 6000);
            }
        });
    }

    updateBreathingUI(phase) {
        const breatheCircle = document.getElementById('breatheCircle');
        const breatheText = document.getElementById('breatheText');
        
        breatheText.textContent = phase.text;
        this.animateBreathCircle(phase);
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

    stopBreathingUI() {
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

        setTimeout(() => {
            breatheText.textContent = '准备开始';
            breatheCircle.style.transition = '';
        }, 2000);
    }

    setupRitualSection() {
        const noiseBtns = document.querySelectorAll('.noise-btn');
        noiseBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                noiseBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                ritualTimer.setNoise(btn.dataset.noise);
            });
        });

        document.getElementById('startRitual').addEventListener('click', () => {
            this.startRitual();
        });

        document.getElementById('stopRitual').addEventListener('click', () => {
            this.stopRitual();
        });

        document.getElementById('volumeSlider').addEventListener('input', (e) => {
            audioService.setVolume(e.target.value / 100);
        });
    }

    startRitual() {
        const minutes = parseInt(document.getElementById('countdownSelect').value);
        
        document.querySelector('.ritual-options').classList.add('hidden');
        document.querySelector('.ritual-animation').classList.add('hidden');
        document.getElementById('ritualTimer').classList.remove('hidden');

        const noiseHint = document.getElementById('noiseHint');
        noiseHint.textContent = ritualTimer.getNoiseHint();

        ritualTimer.start(minutes);
    }

    stopRitual() {
        ritualTimer.stop();

        document.querySelector('.ritual-options').classList.remove('hidden');
        document.querySelector('.ritual-animation').classList.remove('hidden');
        document.getElementById('ritualTimer').classList.add('hidden');
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
        const backup = backupService.export(
            this.thoughtCollection.toJSON(),
            this.tomorrowBox.toJSON()
        );
        
        if (backup) {
            downloadJson(backup, backupService.getFilename());
            this.showToast('备份文件已导出 💾');
        } else {
            this.showToast('暂无数据可导出');
        }
    }

    handleImportFile(file) {
        backupService.parseFile(file)
            .then(backup => this.showImportDialog(backup))
            .catch(err => this.showToast(err.message));
    }

    showImportDialog(backup) {
        const thoughtCount = backup.data.thoughts.length;
        const tomorrowCount = backup.data.tomorrowItems.length;
        const exportDate = backup.exportDate
            ? new Date(backup.exportDate).toLocaleString('zh-CN')
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
                    <p><strong>当前数据：</strong>念头 ${this.thoughtCollection.count()} 条，明日 ${this.tomorrowBox.count()} 条</p>
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
                this.mergeBackup(backup);
            } else {
                this.showReplaceConfirmDialog(() => this.replaceBackup(backup));
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
            undoRedoManager.takeSnapshot('导入备份数据（合并）');
            const result = backupService.merge(
                backup,
                this.thoughtCollection.toJSON(),
                this.tomorrowBox.toJSON()
            );
            
            this.thoughtCollection.fromJSON(result.thoughts, true);
            this.tomorrowBox.fromJSON(result.tomorrowItems, true);
            
            searchService.buildIndex(this.thoughtCollection.getAll().map(t => t.toJSON()));
            insightsAnalyzer.setThoughts(this.thoughtCollection.getAll().map(t => t.toJSON()));
            
            this.cleanupSelectedIds();
            this.updateView();
            this.renderTomorrowList();
            this.renderBreatheList();

            if (result.invalidCount > 0) {
                this.showToast(`导入成功：新增 ${result.addedCount} 条，已忽略 ${result.invalidCount} 条无效数据 ⚠️`);
            } else if (result.addedCount > 0) {
                this.showToast(`已合并导入 ${result.addedCount} 条新记录 🔀`);
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
            undoRedoManager.takeSnapshot('导入备份数据（替换）');
            const result = backupService.replace(backup);
            
            this.thoughtCollection.fromJSON(result.thoughts, true);
            this.tomorrowBox.fromJSON(result.tomorrowItems, true);
            
            searchService.buildIndex(this.thoughtCollection.getAll().map(t => t.toJSON()));
            insightsAnalyzer.setThoughts(this.thoughtCollection.getAll().map(t => t.toJSON()));
            
            this.cleanupSelectedIds();
            this.updateView();
            this.renderTomorrowList();
            this.renderBreatheList();

            if (result.invalidCount > 0) {
                this.showToast(`替换成功：共 ${result.totalCount} 条，已忽略 ${result.invalidCount} 条无效数据 ⚠️`);
            } else {
                this.showToast(`已替换导入 ${result.totalCount} 条记录 🔄`);
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
            searchService.debouncedSearch(e.target.value, this.thoughtCollection.getAll().map(t => t.toJSON()));
            searchService.searchQuery = e.target.value.trim().toLowerCase();
            const clearBtn = document.getElementById('clearSearchBtn');
            clearBtn.style.display = e.target.value ? 'block' : 'none';
            this.updateView();
        });

        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchService.searchQuery = '';
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
                searchService.setCategories(
                    Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value)
                );
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
            searchService.setDateRange(dateFrom.value || null, searchService.filters.dateTo);
            this.updateView();
        });

        dateTo.addEventListener('change', () => {
            searchService.setDateRange(searchService.filters.dateFrom, dateTo.value || null);
            this.updateView();
        });

        clearDateBtn.addEventListener('click', () => {
            dateFrom.value = '';
            dateTo.value = '';
            searchService.setDateRange(null, null);
            this.updateView();
        });

        quickBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const days = parseInt(btn.dataset.days);
                const today = new Date();
                const fromDate = new Date();
                fromDate.setDate(today.getDate() - days);
                
                dateFrom.value = formatDateForInput(fromDate);
                dateTo.value = formatDateForInput(today);
                searchService.setDateRange(dateFrom.value, dateTo.value);
                this.updateView();
            });
        });
    }

    setupTimeSlotFilters() {
        const checkboxes = document.querySelectorAll('#timeSlotFilters input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                searchService.setTimeSlots(
                    Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value)
                );
                this.updateView();
            });
        });
    }

    setupSortOptions() {
        const radios = document.querySelectorAll('input[name="sortBy"]');
        radios.forEach(radio => {
            radio.addEventListener('change', () => {
                searchService.setSortBy(radio.value);
                this.updateView();
            });
        });
    }

    resetAllFilters() {
        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearchBtn').style.display = 'none';
        
        document.querySelectorAll('#categoryFilters input[type="checkbox"]').forEach(cb => cb.checked = true);
        document.getElementById('dateFrom').value = '';
        document.getElementById('dateTo').value = '';
        document.querySelectorAll('#timeSlotFilters input[type="checkbox"]').forEach(cb => cb.checked = true);
        document.querySelector('input[name="sortBy"][value="date-desc"]').checked = true;

        searchService.resetFilters();
        this.updateView();
    }

    hasActiveFilters() {
        return searchService.hasActiveFilters();
    }

    updateView() {
        const normalView = document.getElementById('normalView');
        const searchResultsView = document.getElementById('searchResultsView');
        const resultsInfo = document.getElementById('searchResultsInfo');
        const resultsCount = document.getElementById('resultsCount');

        if (this.hasActiveFilters()) {
            const results = searchService.getFilteredAndSorted(
                this.thoughtCollection.getAll().map(t => t.toJSON())
            );

            normalView.style.display = 'none';
            searchResultsView.style.display = 'block';
            resultsInfo.style.display = 'flex';

            const queryText = searchService.searchQuery ? `「${searchService.searchQuery}」` : '';
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
            const isHistoryExpanded = this.expandedHistoryIds.has(item.id);
            const highlightedText = searchService.highlightText(escapeHtml(item.text), searchService.searchQuery);
            const createdAt = new Date(item.createdAt);
            const hour = createdAt.getHours();
            const timeSlot = getTimeSlot(hour);
            const isSelected = this.selectedThoughtIds.has(item.id);

            if (isEditing) {
                return `
                    <div class="search-result-item editing">
                        ${this.isBatchMode ? `<div class="batch-checkbox-placeholder"></div>` : ''}
                        <div class="result-meta">
                            <span class="result-category cat-${item.category}">${getCategoryLabel(item.category)}</span>
                            <span class="result-time">
                                <span class="result-time-slot">${getTimeSlotLabel(timeSlot)}</span>
                                <span class="result-date">${formatDateTime(item.createdAt)}</span>
                            </span>
                        </div>
                        <textarea 
                            class="edit-input search-edit-input" 
                            data-edit-id="${item.id}"
                            onkeydown="window.app.handleEditKeydown(event, '${item.id}')"
                        >${escapeHtml(item.text)}</textarea>
                        <div class="edit-actions">
                            <button onclick="window.app.saveEditThought('${item.id}', document.querySelector('[data-edit-id=\\'${item.id}\\']').value)" title="保存 (Enter)">✓ 保存</button>
                            <button onclick="window.app.cancelEditThought('${item.id}')" title="取消 (Esc)">✕ 取消</button>
                        </div>
                    </div>
                `;
            }

            return `
                <div class="search-result-item ${isSelected ? 'selected' : ''}" data-thought-id="${item.id}">
                    ${this.isBatchMode ? `
                        <div class="batch-checkbox ${isSelected ? 'checked' : ''}" data-thought-id="${item.id}">
                            <span class="checkbox-icon">${isSelected ? '✓' : ''}</span>
                        </div>
                    ` : ''}
                    <div class="result-meta">
                        <span class="result-category cat-${item.category}">${getCategoryLabel(item.category)}</span>
                        <span class="result-time">
                            <span class="result-time-slot">${getTimeSlotLabel(timeSlot)}</span>
                            <span class="result-date">${formatDateTime(item.createdAt)}</span>
                        </span>
                    </div>
                    <div class="result-text" onclick="window.app.startEditThought('${item.id}')" title="点击编辑">${highlightedText}</div>
                    <div class="result-actions">
                        ${hasHistory ? `<button onclick="window.app.toggleHistory('${item.id}')" title="查看修改历史" class="history-btn ${isHistoryExpanded ? 'active' : ''}">📜</button>` : ''}
                        <button onclick="window.app.moveToTomorrow('${item.id}')" title="移到明天">🌅</button>
                        <button onclick="window.app.removeThought('${item.id}')" title="删除">✕</button>
                    </div>
                    ${isHistoryExpanded ? this.renderHistoryPanel(item) : ''}
                </div>
            `;
        }).join('');
    }

    setupInsights() {
        const timeRangeBtns = document.querySelectorAll('.time-range-btn');
        timeRangeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                timeRangeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                insightsAnalyzer.setTimeRange(btn.dataset.range);

                const customRange = document.getElementById('customDateRange');
                if (insightsAnalyzer.currentTimeRange === 'custom') {
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
            insightsAnalyzer.customDateFrom = dateFrom.value || null;
            if (insightsAnalyzer.customDateFrom && insightsAnalyzer.customDateTo) {
                this.updateInsights();
            }
        });

        dateTo.addEventListener('change', () => {
            insightsAnalyzer.customDateTo = dateTo.value || null;
            if (insightsAnalyzer.customDateFrom && insightsAnalyzer.customDateTo) {
                this.updateInsights();
            }
        });

        let resizeTimeout = null;
        window.addEventListener('resize', () => {
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            resizeTimeout = setTimeout(() => {
                this.updateInsights();
            }, 200);
        });
    }

    updateInsights() {
        insightsAnalyzer.setThoughts(this.thoughtCollection.getAll().map(t => t.toJSON()));
        const data = insightsAnalyzer.getAllData();

        this.renderInsightStats(data.stats);
        this.renderInsightCharts(data);
        this.renderInsightSuggestions(data.suggestions);
    }

    renderInsightStats(stats) {
        const totalEl = document.getElementById('statTotalEntries');
        const streakEl = document.getElementById('statStreakDays');
        const activeEl = document.getElementById('statActiveDays');
        const avgEl = document.getElementById('statAvgPerDay');

        if (totalEl) animateValue(totalEl, stats.totalEntries);
        if (streakEl) animateValue(streakEl, stats.streakDays);
        if (activeEl) animateValue(activeEl, stats.activeDays);
        if (avgEl) animateValue(avgEl, parseFloat(stats.avgPerDay), 600, true);
    }

    renderInsightCharts(data) {
        const trendCanvas = document.getElementById('trendChart');
        const donutCanvas = document.getElementById('categoryChart');
        const weekdayCanvas = document.getElementById('weekdayChart');

        if (trendCanvas) {
            chartRenderer.drawLineChart(trendCanvas, data.trendData);
        }

        if (donutCanvas) {
            chartRenderer.drawDonutChart(donutCanvas, data.categoryData);
        }

        if (weekdayCanvas) {
            chartRenderer.drawBarChart(weekdayCanvas, data.weekdayData, 
                ['#667eea', '#764ba2', '#4ecdc4', '#ff6b6b', '#ffd93d', '#95e1d3', '#f38181']);
        }

        this.renderTimePeriods(data.timePeriodData);
        this.renderWordCloud(data.wordFrequency);
    }

    renderTimePeriods(periods) {
        const container = document.getElementById('timePeriodBars');
        if (!container) return;

        const maxCount = Math.max(...periods.map(p => p.count), 1);

        container.innerHTML = periods.map(p => `
            <div class="time-period-bar">
                <div class="time-period-label">
                    <span>${p.icon} ${p.label}</span>
                    <span class="time-period-count">${p.count}</span>
                </div>
                <div class="time-period-bar-bg">
                    <div class="time-period-bar-fill" style="width: ${(p.count / maxCount * 100)}%; background: ${p.color};"></div>
                </div>
            </div>
        `).join('');
    }

    renderWordCloud(words) {
        const container = document.getElementById('wordCloud');
        if (!container) return;

        if (words.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无词云数据</div>';
            return;
        }

        const maxCount = Math.max(...words.map(w => w[1]));
        const minSize = 12;
        const maxSize = 28;

        container.innerHTML = words.map(w => {
            const size = minSize + (w[1] / maxCount) * (maxSize - minSize);
            return `<span class="word-cloud-item" style="font-size: ${size}px;">${escapeHtml(w[0])}</span>`;
        }).join('');
    }

    renderInsightSuggestions(suggestions) {
        const container = document.getElementById('suggestionsList');
        if (!container) return;

        if (suggestions.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无建议</div>';
            return;
        }

        container.innerHTML = suggestions.map(s => `
            <div class="suggestion-card ${s.type}">
                <div class="suggestion-icon">${s.icon}</div>
                <div class="suggestion-text">${s.text}</div>
            </div>
        `).join('');
    }

    setupReminderSystem() {
        this.initReminderUI();
        this.setupReminderEventListeners();
        reminderService.start();
        this.updateNextReminderDisplay();
    }

    initReminderUI() {
        const settings = reminderService.getSettings();
        const status = reminderService.getPermissionStatus();
        
        this.updateNotificationStatus(status);
        
        document.getElementById('enableReminder').checked = settings.enabled;
        document.getElementById('reminderTime').value = settings.time;
        document.querySelector(`input[name="repeatMode"][value="${settings.repeatMode}"]`).checked = true;
        document.getElementById('reminderTitle').value = settings.title;
        document.getElementById('reminderMessage').value = settings.message;
        document.getElementById('enableSound').checked = settings.sound;
        
        this.updateTimeSettingGroup();
        this.updatePreview();
    }

    setupReminderEventListeners() {
        document.getElementById('requestPermissionBtn').addEventListener('click', async () => {
            const result = await reminderService.requestPermission();
            this.updateNotificationStatus(result.permission);
            if (result.granted) {
                this.showToast('通知权限已开启 🔔');
                reminderService.start();
                this.updateNextReminderDisplay();
            }
        });

        document.getElementById('enableReminder').addEventListener('change', (e) => {
            reminderService.setEnabled(e.target.checked);
            this.updateTimeSettingGroup();
            this.updateNextReminderDisplay();
        });

        document.getElementById('reminderTime').addEventListener('change', (e) => {
            reminderService.setTime(e.target.value);
            this.updateNextReminderDisplay();
        });

        document.querySelectorAll('input[name="repeatMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                reminderService.setRepeatMode(e.target.value);
                this.updateNextReminderDisplay();
            });
        });

        document.getElementById('reminderTitle').addEventListener('input', (e) => {
            reminderService.setTitle(e.target.value);
            this.updatePreview();
        });

        document.getElementById('reminderMessage').addEventListener('input', (e) => {
            reminderService.setMessage(e.target.value);
            this.updatePreview();
        });

        document.getElementById('enableSound').addEventListener('change', (e) => {
            reminderService.setSound(e.target.checked);
        });

        document.getElementById('testNotificationBtn').addEventListener('click', () => {
            reminderService.showNotification();
        });

        setInterval(() => {
            this.updateNextReminderDisplay();
        }, 60000);
    }

    updateNotificationStatus(status) {
        const statusDot = document.querySelector('#notificationStatus .status-dot');
        const statusText = document.getElementById('statusText');
        const requestBtn = document.getElementById('requestPermissionBtn');

        switch (status) {
            case 'granted':
                statusDot.style.background = '#4ade80';
                statusText.textContent = '已授权';
                requestBtn.style.display = 'none';
                break;
            case 'denied':
                statusDot.style.background = '#f87171';
                statusText.textContent = '已拒绝';
                requestBtn.textContent = '重新申请';
                break;
            case 'unsupported':
                statusDot.style.background = '#fbbf24';
                statusText.textContent = '不支持';
                requestBtn.style.display = 'none';
                break;
            default:
                statusDot.style.background = '#9ca3af';
                statusText.textContent = '未授权';
                requestBtn.style.display = 'block';
        }
    }

    updateTimeSettingGroup() {
        const enabled = document.getElementById('enableReminder').checked;
        const groups = ['timeSettingGroup', 'repeatSettingGroup', 'contentSettingGroup', 'soundSettingGroup'];
        
        groups.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.opacity = enabled ? '1' : '0.5';
                el.style.pointerEvents = enabled ? 'auto' : 'none';
            }
        });
    }

    updatePreview() {
        const title = document.getElementById('reminderTitle').value || '该准备睡觉了';
        const message = document.getElementById('reminderMessage').value || '放下手机，开始睡前整理吧';
        
        document.getElementById('previewTitle').textContent = title;
        document.getElementById('previewMessage').textContent = message;
    }

    updateNextReminderDisplay() {
        const nextTime = reminderService.formatNextReminderTime();
        const infoEl = document.getElementById('nextReminderInfo');
        const timeEl = document.getElementById('nextReminderTime');
        
        if (nextTime) {
            infoEl.style.display = 'flex';
            timeEl.textContent = nextTime;
        } else {
            infoEl.style.display = 'none';
        }
    }

    setupBatchOperations() {
        const toggleBtn = document.getElementById('toggleBatchBtn');
        const cancelBtn = document.getElementById('cancelBatchBtn');
        const selectAllBtn = document.getElementById('selectAllBtn');
        const invertSelectBtn = document.getElementById('invertSelectBtn');
        const batchDeleteBtn = document.getElementById('batchDeleteBtn');
        const batchTomorrowBtn = document.getElementById('batchTomorrowBtn');
        const batchCatBtns = document.querySelectorAll('.batch-cat');

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleBatchMode());
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.toggleBatchMode(false));
        }
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => this.selectAll());
        }
        if (invertSelectBtn) {
            invertSelectBtn.addEventListener('click', () => this.invertSelection());
        }
        if (batchDeleteBtn) {
            batchDeleteBtn.addEventListener('click', () => this.batchDelete());
        }
        if (batchTomorrowBtn) {
            batchTomorrowBtn.addEventListener('click', () => this.batchMoveToTomorrow());
        }
        batchCatBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.dataset.batchCategory;
                this.batchUpdateCategory(category);
            });
        });

        this.setupBatchEventDelegation();
        this.setupBatchKeyboardShortcuts();
    }

    setupBatchKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (this.currentTab !== 'jot') return;
            
            if (e.key === 'Escape' && this.isBatchMode) {
                e.preventDefault();
                this.toggleBatchMode(false);
            }
            
            const isMod = e.ctrlKey || e.metaKey;
            if (isMod && e.key.toLowerCase() === 'a' && this.isBatchMode) {
                e.preventDefault();
                this.selectAll();
            }
            
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.isBatchMode && this.selectedThoughtIds.size > 0) {
                    const activeElement = document.activeElement;
                    const isInputActive = activeElement && 
                        (activeElement.tagName === 'INPUT' || 
                         activeElement.tagName === 'TEXTAREA' ||
                         activeElement.isContentEditable);
                    if (!isInputActive) {
                        e.preventDefault();
                        this.batchDelete();
                    }
                }
            }
        });
    }

    setupBatchEventDelegation() {
        const normalView = document.getElementById('normalView');
        const searchResultsView = document.getElementById('searchResultsView');

        const handleItemClick = (e) => {
            if (!this.isBatchMode) return;
            
            const thoughtItem = e.target.closest('.thought-item, .search-result-item');
            if (!thoughtItem) return;
            
            if (e.target.closest('button') || e.target.closest('textarea') || e.target.closest('.edit-actions') || e.target.closest('.history-btn')) {
                return;
            }
            
            const thoughtId = thoughtItem.dataset.thoughtId;
            if (thoughtId) {
                e.preventDefault();
                this.toggleThoughtSelection(thoughtId);
            }
        };

        if (normalView) {
            normalView.addEventListener('click', handleItemClick);
        }
        if (searchResultsView) {
            searchResultsView.addEventListener('click', handleItemClick);
        }
    }

    toggleBatchMode(enable) {
        if (enable === undefined) {
            this.isBatchMode = !this.isBatchMode;
        } else {
            this.isBatchMode = enable;
        }

        const toolbar = document.getElementById('batchToolbar');
        const toggleBtn = document.getElementById('toggleBatchBtn');

        if (toolbar) {
            toolbar.style.display = this.isBatchMode ? 'flex' : 'none';
        }
        if (toggleBtn) {
            toggleBtn.classList.toggle('active', this.isBatchMode);
        }

        if (!this.isBatchMode) {
            this.clearSelection();
        }

        this.updateView();
        this.renderBreatheList();
    }

    toggleThoughtSelection(thoughtId) {
        if (this.selectedThoughtIds.has(thoughtId)) {
            this.selectedThoughtIds.delete(thoughtId);
        } else {
            this.selectedThoughtIds.add(thoughtId);
        }
        this.updateSelectedCount();
        this.updateView();
    }

    getCurrentVisibleThoughtIds() {
        if (this.hasActiveFilters()) {
            const results = searchService.getFilteredAndSorted(
                this.thoughtCollection.getAll().map(t => t.toJSON())
            );
            return results.map(r => r.id);
        } else {
            return this.thoughtCollection.getAll().map(t => t.id);
        }
    }

    selectAll() {
        const visibleIds = this.getCurrentVisibleThoughtIds();
        visibleIds.forEach(id => this.selectedThoughtIds.add(id));
        this.updateSelectedCount();
        this.updateView();
    }

    invertSelection() {
        const visibleIds = this.getCurrentVisibleThoughtIds();
        visibleIds.forEach(id => {
            if (this.selectedThoughtIds.has(id)) {
                this.selectedThoughtIds.delete(id);
            } else {
                this.selectedThoughtIds.add(id);
            }
        });
        this.updateSelectedCount();
        this.updateView();
    }

    clearSelection() {
        this.selectedThoughtIds.clear();
        this.updateSelectedCount();
    }

    cleanupSelectedIds() {
        const existingIds = new Set(this.thoughtCollection.getAll().map(t => t.id));
        let changed = false;
        for (const id of this.selectedThoughtIds) {
            if (!existingIds.has(id)) {
                this.selectedThoughtIds.delete(id);
                changed = true;
            }
        }
        if (changed) {
            this.updateSelectedCount();
        }
    }

    updateSelectedCount() {
        const countEl = document.getElementById('selectedCount');
        if (countEl) {
            countEl.textContent = this.selectedThoughtIds.size;
        }
    }

    batchDelete() {
        if (this.selectedThoughtIds.size === 0) {
            this.showToast('请先选择要删除的条目');
            return;
        }

        const count = this.selectedThoughtIds.size;
        if (!confirm(`确定要删除选中的 ${count} 条记录吗？`)) {
            return;
        }

        const ids = Array.from(this.selectedThoughtIds);
        undoRedoManager.takeSnapshot(`批量删除 ${count} 条记录`);
        
        this.thoughtCollection.removeMany(ids);
        searchService.buildIndex(this.thoughtCollection.getAll().map(t => t.toJSON()));
        insightsAnalyzer.setThoughts(this.thoughtCollection.getAll().map(t => t.toJSON()));
        
        this.clearSelection();
        this.updateView();
        this.renderBreatheList();
        this.showToast(`已删除 ${count} 条记录`);
    }

    batchUpdateCategory(category) {
        if (this.selectedThoughtIds.size === 0) {
            this.showToast('请先选择要修改的条目');
            return;
        }

        const categoryNames = { todo: '待办', worry: '担忧', idea: '灵感' };
        const count = this.selectedThoughtIds.size;
        const ids = Array.from(this.selectedThoughtIds);

        undoRedoManager.takeSnapshot(`批量修改为${categoryNames[category] || category}`);
        
        this.thoughtCollection.updateCategoryMany(ids, category);
        searchService.buildIndex(this.thoughtCollection.getAll().map(t => t.toJSON()));
        insightsAnalyzer.setThoughts(this.thoughtCollection.getAll().map(t => t.toJSON()));
        
        this.updateView();
        this.renderBreatheList();
        this.showToast(`已将 ${count} 条记录改为${categoryNames[category] || category}`);
    }

    batchMoveToTomorrow() {
        if (this.selectedThoughtIds.size === 0) {
            this.showToast('请先选择要移动的条目');
            return;
        }

        const count = this.selectedThoughtIds.size;
        const ids = Array.from(this.selectedThoughtIds);
        const thoughts = ids.map(id => this.thoughtCollection.getById(id)).filter(Boolean);
        const texts = thoughts.map(t => t.text);

        undoRedoManager.takeSnapshot(`批量移入明日盒子(${count}条)`);
        
        this.tomorrowBox.addMany(texts);
        this.thoughtCollection.removeMany(ids);
        searchService.buildIndex(this.thoughtCollection.getAll().map(t => t.toJSON()));
        insightsAnalyzer.setThoughts(this.thoughtCollection.getAll().map(t => t.toJSON()));
        
        this.clearSelection();
        this.updateView();
        this.renderBreatheList();
        this.renderTomorrowList();
        this.showToast(`已将 ${count} 条记录移入明日盒子 🌅`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new BrainDumpApp();
});
