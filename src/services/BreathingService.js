import { eventBus } from '../core/EventBus.js';

export class BreathingService {
    constructor(voiceGuideService) {
        this.voiceGuideService = voiceGuideService;
        this.breathingModes = {
            relax4: { name: '基础放松', icon: '🧘', inhale: 4, hold1: 4, exhale: 4, hold2: 4, desc: '4-4-4-4', hold2Label: '放松' },
            deep478: { name: '深度放松', icon: '😴', inhale: 4, hold1: 7, exhale: 8, hold2: 0, desc: '4-7-8', hold2Label: '放松' },
            box: { name: '盒式呼吸', icon: '📦', inhale: 4, hold1: 4, exhale: 4, hold2: 4, desc: '4-4-4-4', hold2Label: '保持' },
            energy: { name: '活力呼吸', icon: '⚡', inhale: 6, hold1: 0, exhale: 6, hold2: 0, desc: '6-0-6-0', hold2Label: '放松' },
            custom: { name: '自定义', icon: '⚙️', inhale: 4, hold1: 4, exhale: 4, hold2: 4, desc: '自由设置', hold2Label: '放松' }
        };
        this.currentMode = 'relax4';
        this.isActive = false;
        this.phases = [];
        this.timer = null;
        this.phaseTimerInterval = null;
        this.phaseRemainingSeconds = 0;
        this.currentPhaseIndex = 0;
        this.cycleCount = 0;
    }

    getModes() {
        return { ...this.breathingModes };
    }

    getCurrentMode() {
        return this.breathingModes[this.currentMode];
    }

    setMode(modeKey) {
        if (this.isActive) return false;
        if (this.breathingModes[modeKey]) {
            this.currentMode = modeKey;
            eventBus.emit('breathing:modeChanged', { mode: modeKey, config: this.breathingModes[modeKey] });
            return true;
        }
        return false;
    }

    setCustomPhase(phase, value) {
        if (this.isActive || this.currentMode !== 'custom') return false;
        
        const mode = this.breathingModes.custom;
        if (phase in mode) {
            if (phase === 'inhale' || phase === 'exhale') {
                value = Math.max(1, Math.min(20, value));
            } else {
                value = Math.max(0, Math.min(20, value));
            }
            mode[phase] = value;
            eventBus.emit('breathing:customPhaseChanged', { phase, value });
            return true;
        }
        return false;
    }

    getActivePhases() {
        const mode = this.breathingModes[this.currentMode];
        const phases = [];
        phases.push({ key: 'inhale', text: '吸气', duration: mode.inhale * 1000, scaleTarget: 1.3 });
        if (mode.hold1 > 0) {
            phases.push({ key: 'hold1', text: this.currentMode === 'box' ? '保持' : '保持', duration: mode.hold1 * 1000, scaleTarget: 1.3 });
        }
        phases.push({ key: 'exhale', text: '呼气', duration: mode.exhale * 1000, scaleTarget: 1.0 });
        if (mode.hold2 > 0) {
            const hold2Text = this.currentMode === 'box' ? '保持' : '放松';
            phases.push({ key: 'hold2', text: hold2Text, duration: mode.hold2 * 1000, scaleTarget: 1.0 });
        }
        return phases;
    }

    start(onPhaseChange) {
        if (this.isActive) return;

        this.isActive = true;
        this.phases = this.getActivePhases();
        this.currentPhaseIndex = 0;
        this.cycleCount = 0;

        eventBus.emit('breathing:started', { mode: this.currentMode });

        const runPhase = () => {
            if (!this.isActive) return;

            const currentPhase = this.phases[this.currentPhaseIndex];
            
            if (onPhaseChange) {
                onPhaseChange(currentPhase, this.cycleCount);
            }
            eventBus.emit('breathing:phase', { 
                phase: currentPhase, 
                cycleCount: this.cycleCount 
            });

            if (this.voiceGuideService) {
                this.voiceGuideService.speak(currentPhase.text);
            }

            this.startPhaseCountdown(currentPhase.duration / 1000);

            this.timer = setTimeout(() => {
                this.currentPhaseIndex++;

                if (this.currentPhaseIndex >= this.phases.length) {
                    this.currentPhaseIndex = 0;
                    this.cycleCount++;
                    eventBus.emit('breathing:cycleCompleted', { cycleCount: this.cycleCount });
                }

                if (this.isActive) {
                    runPhase();
                }
            }, currentPhase.duration);
        };

        runPhase();
    }

    startPhaseCountdown(totalSeconds) {
        if (this.phaseTimerInterval) {
            clearInterval(this.phaseTimerInterval);
        }

        this.phaseRemainingSeconds = totalSeconds;
        eventBus.emit('breathing:countdown', { 
            remaining: Math.ceil(this.phaseRemainingSeconds), 
            total: totalSeconds 
        });

        this.phaseTimerInterval = setInterval(() => {
            this.phaseRemainingSeconds -= 0.1;
            if (this.phaseRemainingSeconds <= 0) {
                this.phaseRemainingSeconds = 0;
                clearInterval(this.phaseTimerInterval);
            }
            eventBus.emit('breathing:countdown', { 
                remaining: Math.ceil(this.phaseRemainingSeconds), 
                total: totalSeconds 
            });
        }, 100);
    }

    stop() {
        if (!this.isActive) return;

        this.isActive = false;

        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.phaseTimerInterval) {
            clearInterval(this.phaseTimerInterval);
            this.phaseTimerInterval = null;
        }

        if (this.voiceGuideService) {
            this.voiceGuideService.stop();
        }

        eventBus.emit('breathing:stopped', { cycleCount: this.cycleCount });
    }

    getInstructionText() {
        const texts = {
            relax4: '基础放松呼吸，让身心回归平静',
            deep478: '深度放松呼吸，释放深层压力',
            box: '盒式呼吸，专注而平衡',
            energy: '活力呼吸，唤醒身心能量',
            custom: '自定义呼吸，按你的节奏来'
        };
        return texts[this.currentMode] || '跟随呼吸节奏，让思绪慢慢消散';
    }

    isBreathingActive() {
        return this.isActive;
    }

    getCycleCount() {
        return this.cycleCount;
    }

    getHold2Label() {
        return this.breathingModes[this.currentMode].hold2Label;
    }
}

export const createBreathingService = (voiceGuideService) => {
    return new BreathingService(voiceGuideService);
};
