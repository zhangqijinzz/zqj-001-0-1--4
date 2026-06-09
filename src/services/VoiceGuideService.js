import { eventBus } from '../core/EventBus.js';
import { storage } from '../core/Storage.js';

export class VoiceGuideService {
    constructor() {
        this.settings = storage.get('voiceGuideSettings', {
            enabled: false,
            volume: 70,
            rate: 80,
            voiceIndex: -1
        });
        this.currentUtterance = null;
    }

    init() {
        if ('speechSynthesis' in window) {
            speechSynthesis.onvoiceschanged = () => this.populateVoiceList();
        }
        this.setupUI();
        this.updateUI();
    }

    setupUI() {
        const enabledCheckbox = document.getElementById('voiceGuideEnabled');
        const volumeSlider = document.getElementById('voiceVolume');
        const rateSlider = document.getElementById('voiceRate');
        const voiceSelect = document.getElementById('voiceSelect');
        const testBtn = document.getElementById('voiceTestBtn');

        if (enabledCheckbox) {
            enabledCheckbox.addEventListener('change', (e) => {
                this.settings.enabled = e.target.checked;
                this.saveSettings();
                this.updateControlVisibility();
                if (!e.target.checked) {
                    this.stop();
                }
            });
        }

        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                this.settings.volume = parseInt(e.target.value);
                this.updateDisplayValues();
                this.saveSettings();
            });
        }

        if (rateSlider) {
            rateSlider.addEventListener('input', (e) => {
                this.settings.rate = parseInt(e.target.value);
                this.updateDisplayValues();
                this.saveSettings();
            });
        }

        if (voiceSelect) {
            voiceSelect.addEventListener('change', (e) => {
                this.settings.voiceIndex = parseInt(e.target.value);
                this.saveSettings();
            });
        }

        if (testBtn) {
            testBtn.addEventListener('click', () => {
                this.speak('吸气', true);
            });
        }
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

        if (this.settings.voiceIndex >= 0) {
            voiceSelect.value = this.settings.voiceIndex;
        }
    }

    updateUI() {
        const enabledCheckbox = document.getElementById('voiceGuideEnabled');
        const volumeSlider = document.getElementById('voiceVolume');
        const rateSlider = document.getElementById('voiceRate');

        if (enabledCheckbox) enabledCheckbox.checked = this.settings.enabled;
        if (volumeSlider) volumeSlider.value = this.settings.volume;
        if (rateSlider) rateSlider.value = this.settings.rate;

        this.updateControlVisibility();
        this.updateDisplayValues();
        this.populateVoiceList();
    }

    updateControlVisibility() {
        const controlsEl = document.getElementById('voiceGuideControls');
        if (controlsEl) {
            controlsEl.style.display = this.settings.enabled ? 'block' : 'none';
        }
    }

    updateDisplayValues() {
        const volumeValue = document.getElementById('voiceVolumeValue');
        const rateValue = document.getElementById('voiceRateValue');
        if (volumeValue) volumeValue.textContent = this.settings.volume + '%';
        if (rateValue) rateValue.textContent = (this.settings.rate / 100).toFixed(1) + 'x';
    }

    saveSettings() {
        storage.set('voiceGuideSettings', this.settings);
        eventBus.emit('voiceGuide:settingsChanged', this.settings);
    }

    speak(text, isTest = false) {
        if (!this.settings.enabled && !isTest) return;
        if (!('speechSynthesis' in window)) return;

        speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = this.settings.volume / 100;
        utterance.rate = this.settings.rate / 100;
        utterance.pitch = 0.9;

        const voices = speechSynthesis.getVoices();
        const selectedIndex = this.settings.voiceIndex;
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

    stop() {
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
        this.currentUtterance = null;
    }

    isEnabled() {
        return this.settings.enabled;
    }

    isSupported() {
        return 'speechSynthesis' in window;
    }
}

export const voiceGuideService = new VoiceGuideService();
